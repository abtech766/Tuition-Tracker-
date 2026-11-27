/* Option A adapter: Supabase Auth only; all app data goes through Render/GitHub API. */
(function (global) {
  "use strict";
  var api = global.supabase;
  if (!api || !api.createClient) throw new Error("Supabase Auth SDK is not loaded");
  var AUTH_URL = "https://msubahirksnlfrhjevxd.supabase.co";
  var AUTH_ANON_KEY = "sb_publishable_IRn87c3WsUQOSrbSr43wdQ_1CNyINv8";
  var BACKEND_URL = "YOUR_RENDER_BACKEND_URL";
  var authClient = api.createClient(AUTH_URL, AUTH_ANON_KEY);
  async function token() { var s = await authClient.auth.getSession(); return s.data.session && s.data.session.access_token; }
  async function call(path, options) {
    var t = await token(); if (!t) throw new Error("Not signed in");
    var r = await fetch(BACKEND_URL.replace(/\/$/, "") + path, { method: options && options.method || "GET", headers: Object.assign({ Authorization: "Bearer " + t, "Content-Type": "application/json" }, options && options.headers || {}), body: options && options.body ? JSON.stringify(options.body) : undefined });
    var json = await r.json().catch(function () { return { data: null, error: { message: "Invalid backend response" } }; });
    if (!r.ok || json.error) return { data: json.data || null, error: new Error(json.error && (json.error.message || json.error) || "Backend request failed") };
    return json;
  }
  function Builder(table) { this.table = table; this.filters = {}; this.orderBy = null; this.limitN = 100; this.one = false; this.mode = "read"; this.payload = null; }
  Builder.prototype.select = function () { return this; };
  Builder.prototype.eq = function (f, v) { this.filters[f] = v; return this; };
  Builder.prototype.is = function (f, v) { this.filters[f] = v; return this; };
  Builder.prototype.order = function (f, o) { this.orderBy = { field: f, ascending: !o || o.ascending !== false }; return this; };
  Builder.prototype.limit = function (n) { this.limitN = n; return this; };
  Builder.prototype.single = function () { this.one = true; return this; };
  Builder.prototype.insert = function (p) { this.mode = "insert"; this.payload = p; return this; };
  Builder.prototype.update = function (p) { this.mode = "update"; this.payload = p; return this; };
  Builder.prototype.delete = function () { this.mode = "delete"; return this; };
  Builder.prototype.then = function (resolve, reject) { return this.execute().then(resolve, reject); };
  Builder.prototype.execute = async function () {
    if (this.mode === "read") return call("/v1/data/" + encodeURIComponent(this.table) + "/query", { method: "POST", body: { filters: this.filters, order: this.orderBy, limit: this.limitN, single: this.one } });
    if (this.mode === "insert") return call("/v1/data/" + encodeURIComponent(this.table) + "/insert", { method: "POST", body: { record: this.payload } });
    if (this.mode === "update") return call("/v1/data/" + encodeURIComponent(this.table) + "/update", { method: "PATCH", body: { filters: this.filters, changes: this.payload } });
    return call("/v1/data/" + encodeURIComponent(this.table) + "/delete", { method: "DELETE", body: { filters: this.filters } });
  };
  var auth = {
    signUp: async function (args) {
      var result = await authClient.auth.signUp(args);
      if (!result.error && result.data.session && result.data.user) {
        var d = args.options && args.options.data || {};
        var profile = await call("/v1/data/profiles/insert", { method: "POST", body: { record: { id: result.data.user.id, role: d.role, full_name: d.full_name, phone: d.phone || "", language: "en" } } });
        if (profile.error) return profile;
        if (d.role === "parent" && d.student_name) {
          var student = await call("/v1/data/students/insert", { method: "POST", body: { record: { parent_id: result.data.user.id, name: d.student_name, created_at: new Date().toISOString() } } });
          if (student.error) return student;
        }
      }
      return result;
    },
    signInWithPassword: function (args) { return authClient.auth.signInWithPassword(args); },
    getSession: function () { return authClient.auth.getSession(); },
    signOut: function () { return authClient.auth.signOut(); },
    resetPasswordForEmail: function (email, opts) { return authClient.auth.resetPasswordForEmail(email, opts); },
    updateUser: function (p) { return authClient.auth.updateUser(p); },
    updateRecovery: function (_id, _secret, password) { return authClient.auth.updateUser({ password: password }); }
  };
  global.sb = {
    auth: auth,
    from: function (table) { return new Builder(table); },
    rpc: function (name, params) { return call("/v1/rpc/" + encodeURIComponent(name), { method: "POST", body: params || {} }); },
    storage: { from: function (bucket) { return { upload: function (path, file, opts) { return new Promise(function (resolve, reject) { var fr = new FileReader(); fr.onload = async function () { var r = await call("/v1/storage/upload", { method: "POST", body: { bucket: bucket, path: path, contentType: opts && opts.contentType, content: String(fr.result).split(",")[1] } }); r.error ? reject(r.error) : resolve(r); }; fr.onerror = reject; fr.readAsDataURL(file); }); }, createSignedUrls: async function (paths) { var t = await token(); return { data: paths.map(function (path) { return { path: path, signedUrl: BACKEND_URL.replace(/\/$/, "") + "/v1/storage/view?path=" + encodeURIComponent(path) + "&token=" + encodeURIComponent(t || "") }; }), error: null }; } }; } }, authClient: authClient
  };
})(window);
