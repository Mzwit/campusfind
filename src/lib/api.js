/**
 * One data layer, two adapters.
 *
 *   demo mode  — everything lives in memory, seeded from mock.js
 *   live mode  — Supabase Postgres, Auth and Storage
 *
 * The UI only ever calls the functions in this file, so switching between the
 * two is a matter of setting two environment variables.
 */
import { supabase, isLive, PHOTO_BUCKET, publicPhotoUrl } from "./supabase";
import { SEED_ITEMS, SEED_ARCHIVE, SEED_HELP, SEED_NOTIFS } from "./mock";

export { isLive };

const uid = () => Math.random().toString(36).slice(2, 9);
const shortName = (full) => {
  const p = (full || "Student").trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
};

/* ------------------------------------------------------------------ demo -- */

const demo = {
  items: [...SEED_ITEMS],
  archive: [...SEED_ARCHIVE],
  posts: [...SEED_HELP],
  notifs: [...SEED_NOTIFS],
  comments: {
    i1: [{ who: "Lerato M.", text: "I think I saw this near the cafeteria stairs on Tuesday afternoon.", ts: Date.now() - 4 * 3600e3 }],
  },
  user: null,
};

const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ auth -- */
/*
 * Two factors, both real.
 *
 *   1. A university email and password.       -> session at AAL1
 *   2. A six-digit code from an authenticator -> session at AAL2
 *
 * Only an AAL2 session may post a report, claim an item or moderate; the
 * database enforces that, not the interface (see is_aal2() in schema.sql).
 * Live mode uses Supabase's TOTP MFA APIs. Demo mode runs the same protocol
 * locally through src/lib/totp.js, so a code scanned into Google Authenticator
 * validates either way.
 */

const DEMO_KEY = "campusfind.demo.account";

const readDemo = () => {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || null; } catch { return null; }
};
const writeDemo = (v) => {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(v)); } catch { /* private browsing */ }
};

const UNIVERSITY = /^[^@\s]+@[^@\s]+\.(ac|edu)(\.[a-z]{2,})?$/i;
export const isUniversityEmail = (e) => UNIVERSITY.test((e || "").trim());

const nameFromEmail = (email) =>
  email.split("@")[0].replace(/[._\d]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()) || "Student";

export const auth = {
  isUniversityEmail,

  /**
   * The whole authentication picture in one object, so the UI never has to
   * guess which screen to show.
   *   null                         -> signed out
   *   { user, stage: "enroll" }    -> signed in, no authenticator yet
   *   { user, stage: "challenge" } -> signed in, code required
   *   { user, stage: "ready" }     -> fully authenticated
   */
  async current() {
    if (!isLive) {
      const acc = readDemo();
      if (!acc?.session) return null;
      const user = demoUser(acc);
      if (!acc.secret) return { user, stage: "enroll" };
      if (!acc.passedChallenge) return { user, stage: "challenge" };
      return { user, stage: "ready" };
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    const user = await profileFromSession(data.session);
    if (!user) return null;
    return { user, stage: await mfaStage() };
  },

  async signUp(email, password) {
    if (!isUniversityEmail(email)) throw new Error("Use your university email address.");
    if ((password || "").length < 8) throw new Error("Passwords need at least 8 characters.");

    if (!isLive) {
      const existing = readDemo();
      if (existing?.email === email.toLowerCase()) throw new Error("That account already exists — sign in instead.");
      writeDemo({ email: email.toLowerCase(), password, session: true, secret: null, passedChallenge: false });
      return { needsEmailConfirmation: false };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: nameFromEmail(email) } },
    });
    if (error) throw new Error(error.message);
    return { needsEmailConfirmation: !data.session };
  },

  async signIn(email, password) {
    if (!isUniversityEmail(email)) throw new Error("Use your university email address.");

    if (!isLive) {
      const acc = readDemo();
      if (!acc || acc.email !== email.toLowerCase()) throw new Error("No account with that address. Create one first.");
      if (acc.password !== password) throw new Error("That password doesn't match.");
      writeDemo({ ...acc, session: true, passedChallenge: false });
      return { needsEmailConfirmation: false };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (/email not confirmed/i.test(error.message)) {
        throw new Error("Confirm your email first — check your inbox for the link.");
      }
      throw new Error(error.message);
    }
    return { needsEmailConfirmation: false };
  },

  async resetPassword(email) {
    if (!isLive) return { ok: true };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /* ------------------------------------------------------------ factors -- */

  /** Starts enrolment and returns what the setup screen needs to draw. */
  async enroll(user) {
    if (!isLive) {
      const acc = readDemo();
      const secret = acc?.pendingSecret || totpSecret();
      writeDemo({ ...acc, pendingSecret: secret });
      const uri = totpUri({ secret, account: acc.email });
      return { factorId: "demo", secret, uri, qrSvg: await totpQr(uri) };
    }

    // A stale unverified factor from an abandoned attempt blocks a new enrol.
    const { data: list } = await supabase.auth.mfa.listFactors();
    const stale = (list?.all || []).filter((f) => f.status === "unverified");
    for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id });

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `CampusFind · ${new Date().toLocaleDateString("en-GB")}`,
      issuer: "CampusFind",
    });
    if (error) throw new Error(error.message);
    return {
      factorId: data.id,
      secret: data.totp.secret,
      uri: data.totp.uri,
      qrDataUri: data.totp.qr_code,
    };
  },

  /** Confirms a six-digit code, for both enrolment and sign-in. */
  async verify(factorId, code) {
    const entered = String(code || "").replace(/\D/g, "");
    if (entered.length !== 6) throw new Error("Enter the six digits from your authenticator.");

    if (!isLive) {
      const acc = readDemo();
      const secret = acc?.pendingSecret || acc?.secret;
      if (!secret) throw new Error("Set up your authenticator first.");
      const ok = await totpVerify(secret, entered);
      if (!ok) throw new Error("That code isn't right. Codes change every 30 seconds — try the current one.");
      writeDemo({ ...acc, secret, pendingSecret: null, passedChallenge: true });
      return demoUser(readDemo());
    }

    let id = factorId;
    if (!id) {
      const { data } = await supabase.auth.mfa.listFactors();
      id = (data?.totp || [])[0]?.id;
      if (!id) throw new Error("No authenticator is set up on this account.");
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: entered });
    if (error) {
      throw new Error(/invalid/i.test(error.message)
        ? "That code isn't right. Codes change every 30 seconds — try the current one."
        : error.message);
    }
    const { data } = await supabase.auth.getSession();
    return profileFromSession(data.session);
  },

  /** Removing a factor requires a session that already passed one. */
  async unenroll() {
    if (!isLive) {
      const acc = readDemo();
      writeDemo({ ...acc, secret: null, pendingSecret: null, passedChallenge: false });
      return;
    }
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.all || []) await supabase.auth.mfa.unenroll({ factorId: f.id });
  },

  async factorInfo() {
    if (!isLive) {
      const acc = readDemo();
      return acc?.secret ? [{ id: "demo", name: "Authenticator app", addedAt: acc.addedAt || null }] : [];
    }
    const { data } = await supabase.auth.mfa.listFactors();
    return (data?.totp || []).map((f) => ({
      id: f.id, name: f.friendly_name || "Authenticator app", addedAt: f.created_at,
    }));
  },

  async signOut() {
    if (!isLive) {
      const acc = readDemo();
      writeDemo({ ...acc, session: false, passedChallenge: false });
      return;
    }
    await supabase.auth.signOut();
  },
};

/* Demo-mode TOTP, imported lazily so the crypto and QR code stay out of the
   first paint. */
let totpMod = null;
const totp = async () => (totpMod ||= await import("./totp.js"));
const totpSecret = () => {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, out = "";
  for (const byte of b) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out;
};
const totpUri = async (o) => (await totp()).otpauthURI(o);
const totpVerify = async (s, c) => (await totp()).verifyCode(s, c);
const totpQr = async (uri) => (await totp()).qrSvg(await uri);

function demoUser(acc) {
  return {
    id: "demo-user",
    name: nameFromEmail(acc.email),
    email: acc.email,
    verified: true,
    staff: true,
  };
}

/** Where the user sits between signing in and being allowed to act. */
async function mfaStage() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return "enroll";
  if (data.currentLevel === "aal2") return "ready";
  if (data.nextLevel === "aal2") return "challenge";
  return "enroll";
}

async function profileFromSession(session) {
  if (!session) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, is_verified, is_staff, is_blocked")
    .eq("id", session.user.id)
    .single();
  if (!data) return null;
  if (data.is_blocked) {
    await supabase.auth.signOut();
    throw new Error("This account has been suspended. Contact the campus help desk.");
  }
  return {
    id: data.id,
    name: data.full_name,
    email: data.email,
    verified: data.is_verified,
    staff: data.is_staff,
  };
}

/* ----------------------------------------------------------------- items -- */

function rowToItem(r, userId, images = []) {
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    cat: r.category_id,
    loc: r.location_name,
    locationId: r.location_id,
    spot: r.spot || r.holding || "—",
    desc: r.description,
    brand: r.brand,
    color: r.color,
    ts: new Date(r.occurred_at || r.created_at).getTime(),
    status: r.status === "matched" ? "match" : r.status,
    views: r.views,
    replies: Number(r.reply_count || 0),
    urgent: r.is_urgent,
    owner: shortName(r.reporter_name),
    mine: r.reporter_id === userId,
    photos: Math.max(1, Number(r.photo_count || 0)),
    photoUrls: images.map(publicPhotoUrl).filter(Boolean),
  };
}

export async function listItems(userId) {
  if (!isLive) { await wait(); return demo.items; }
  const { data, error } = await supabase
    .from("items_public")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  const ids = data.map((d) => d.id);
  const byItem = {};
  if (ids.length) {
    const { data: imgs } = await supabase
      .from("item_images")
      .select("item_id, storage_path, is_cover")
      .in("item_id", ids);
    (imgs || []).forEach((im) => {
      (byItem[im.item_id] ||= []).push(im.storage_path);
    });
  }
  return data.map((r) => rowToItem(r, userId, byItem[r.id] || []));
}

/** The marks left behind by purged reports. */
export async function listArchive(userId) {
  if (!isLive) { await wait(0); return demo.archive; }
  const { data, error } = await supabase
    .from("recovery_records")
    .select("id, original_item_id, reporter_id, type, category_id, location_id, reported_at, resolved_at, outcome, days_open, locations(name)")
    .order("resolved_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    itemId: r.original_item_id,
    type: r.type,
    cat: r.category_id,
    loc: r.locations?.name || "Campus",
    reportedAt: new Date(r.reported_at).getTime(),
    resolvedAt: new Date(r.resolved_at).getTime(),
    outcome: r.outcome,
    days: r.days_open,
    mine: r.reporter_id === userId,
  }));
}

export async function createItem(draft, user, files = []) {
  if (!isLive) {
    await wait();
    const item = { ...draft, id: uid(), owner: shortName(user.name), mine: true };
    demo.items = [item, ...demo.items];
    return item;
  }

  const { data: loc } = await supabase.from("locations").select("id").eq("name", draft.loc).maybeSingle();
  const { data, error } = await supabase
    .from("items")
    .insert({
      reporter_id: user.id,
      type: draft.type,
      name: draft.name,
      category_id: draft.cat,
      location_id: loc?.id || 11,
      spot: draft.spot,
      room: draft.room,
      description: draft.desc,
      brand: draft.brand || null,
      color: draft.color || null,
      occurred_at: new Date(draft.ts).toISOString(),
      is_urgent: !!draft.urgent,
      private_marks: draft.unique || null,
      verify_question: draft.verifyQuestion || null,
      holding: draft.holding || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  for (const [i, file] of files.entries()) {
    const path = `${user.id}/${data.id}/${uid()}-${file.name}`.replace(/\s+/g, "_");
    const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
    if (!up.error) {
      await supabase.from("item_images").insert({ item_id: data.id, storage_path: path, is_cover: i === 0 });
    }
  }
  return { ...draft, id: data.id, mine: true, owner: shortName(user.name) };
}

export async function setStatus(id, status) {
  if (!isLive) {
    demo.items = demo.items.map((i) => (i.id === id ? { ...i, status } : i));
    return;
  }
  const { error } = await supabase
    .from("items")
    .update({ status: status === "match" ? "matched" : status })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Purge a report but keep the mark.
 *
 * Calls the archive_item() function, which writes a small row into
 * recovery_records and then deletes the item. Photos, comments, claims and
 * match rows go with it via ON DELETE CASCADE. The storage files are removed
 * here first, and any that slip through are queued in storage_gc for the
 * cleanup script.
 */
export async function archiveItem(item, outcome = "recovered", user) {
  if (!isLive) {
    await wait();
    demo.items = demo.items.filter((i) => i.id !== item.id);
    const mark = {
      id: uid(), itemId: item.id, type: item.type, cat: item.cat, loc: item.loc,
      reportedAt: item.ts, resolvedAt: Date.now(), outcome,
      days: Math.max(0, Math.round((Date.now() - item.ts) / 864e5)), mine: true,
    };
    demo.archive = [mark, ...demo.archive];
    return mark;
  }

  const { data: imgs } = await supabase.from("item_images").select("storage_path").eq("item_id", item.id);
  const paths = (imgs || []).map((i) => i.storage_path);
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);

  const { data, error } = await supabase.rpc("archive_item", { p_item: item.id, p_outcome: outcome });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  return {
    id: r.id, itemId: r.original_item_id, type: r.type, cat: r.category_id,
    loc: item.loc, reportedAt: new Date(r.reported_at).getTime(),
    resolvedAt: new Date(r.resolved_at).getTime(), outcome: r.outcome,
    days: r.days_open, mine: r.reporter_id === user?.id,
  };
}

/** Full delete with no mark left behind. Used when a report was a mistake. */
export async function deleteItem(id) {
  if (!isLive) {
    demo.items = demo.items.filter((i) => i.id !== id);
    return;
  }
  const { data: imgs } = await supabase.from("item_images").select("storage_path").eq("item_id", id);
  const paths = (imgs || []).map((i) => i.storage_path);
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

export async function bumpViews(id) {
  if (!isLive) return;
  try { await supabase.rpc("increment_views", { p_item: id }); } catch { /* a missed view count is not worth an error */ }
}

/* -------------------------------------------------------------- comments -- */

export async function listComments(itemId) {
  if (!isLive) return demo.comments[itemId] || [];
  const { data } = await supabase
    .from("comments")
    .select("body, created_at, profiles(full_name)")
    .eq("item_id", itemId)
    .order("created_at");
  return (data || []).map((c) => ({
    who: shortName(c.profiles?.full_name),
    text: c.body,
    ts: new Date(c.created_at).getTime(),
  }));
}

export async function addComment(itemId, body, user) {
  if (!isLive) {
    (demo.comments[itemId] ||= []).push({ who: user.name, text: body, ts: Date.now() });
    return;
  }
  const { error } = await supabase.from("comments").insert({ item_id: itemId, author_id: user.id, body });
  if (error) throw error;
}

/* ----------------------------------------------------------------- claims -- */

export async function submitClaim(itemId, answer, user) {
  if (!isLive) { await wait(); return { ok: true }; }
  const { error } = await supabase
    .from("claims")
    .upsert({ item_id: itemId, claimant_id: user.id, answer }, { onConflict: "item_id,claimant_id" });
  if (error) throw error;
  return { ok: true };
}

export async function flagItem(itemId, reason, user) {
  if (!isLive) return { ok: true };
  await supabase.from("flags").insert({ item_id: itemId, reporter_id: user.id, reason });
  return { ok: true };
}

/* ---------------------------------------------------------- help requests -- */

export async function listHelpPosts() {
  if (!isLive) return demo.posts;
  const { data } = await supabase
    .from("help_posts")
    .select("id, title, item_label, time_hint, detail, created_at, profiles(full_name), locations(name), help_replies(body, created_at, profiles(full_name))")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data || []).map((p) => ({
    id: p.id,
    author: shortName(p.profiles?.full_name),
    title: p.title,
    item: p.item_label,
    loc: p.locations?.name || "Campus",
    time: p.time_hint,
    detail: p.detail,
    ts: new Date(p.created_at).getTime(),
    replies: (p.help_replies || [])
      .map((r) => ({ who: shortName(r.profiles?.full_name), text: r.body, ts: new Date(r.created_at).getTime() }))
      .sort((a, b) => a.ts - b.ts),
  }));
}

export async function createHelpPost(form, user) {
  if (!isLive) {
    const post = { id: uid(), author: user.name, ...form, ts: Date.now(), replies: [] };
    demo.posts = [post, ...demo.posts];
    return post;
  }
  const { data: loc } = await supabase.from("locations").select("id").eq("name", form.loc).maybeSingle();
  const { error } = await supabase.from("help_posts").insert({
    author_id: user.id, title: form.title, item_label: form.item,
    location_id: loc?.id || null, time_hint: form.time, detail: form.detail,
  });
  if (error) throw error;
}

export async function addHelpReply(postId, body, user) {
  if (!isLive) {
    demo.posts = demo.posts.map((p) =>
      p.id === postId ? { ...p, replies: [...p.replies, { who: user.name, text: body, ts: Date.now() }] } : p);
    return;
  }
  const { error } = await supabase.from("help_replies").insert({ post_id: postId, author_id: user.id, body });
  if (error) throw error;
}

/* ---------------------------------------------------------- notifications -- */

export async function listNotifications(user) {
  if (!isLive) return demo.notifs;
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, item_id, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data || []).map((n) => ({
    id: n.id, kind: n.kind, title: n.title, body: n.body,
    link: n.item_id, read: n.read, ts: new Date(n.created_at).getTime(),
  }));
}

export async function pushNotification(n, user) {
  if (!isLive) { demo.notifs = [{ ...n, id: uid(), ts: Date.now(), read: false }, ...demo.notifs]; return; }
  await supabase.from("notifications").insert({
    user_id: user.id, kind: n.kind, title: n.title, body: n.body, item_id: n.link || null,
  });
}

export async function markRead(ids) {
  if (!isLive) {
    demo.notifs = demo.notifs.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n));
    return;
  }
  await supabase.from("notifications").update({ read: true }).in("id", ids);
}

/* ---------------------------------------------------------------- matches -- */

export async function saveMatch(lostId, foundId, score) {
  if (!isLive) return;
  await supabase.from("matches").upsert(
    { lost_item_id: lostId, found_item_id: foundId, score },
    { onConflict: "lost_item_id,found_item_id" }
  );
}
