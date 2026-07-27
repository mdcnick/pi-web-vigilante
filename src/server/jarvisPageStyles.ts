export const JARVIS_PAGE_STYLES = `
:root { color-scheme: dark; --bg:#070a12; --panel:#0d1423; --line:#243552; --text:#edf5ff; --muted:#91a5c3; --accent:#62d8ff; --good:#71f5b2; --bad:#ff8298; }
* { box-sizing: border-box; }
body { margin:0; min-height:100dvh; color:var(--text); background:radial-gradient(circle at 50% 0,rgba(35,157,235,.18),transparent 32rem),var(--bg); font:14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif; }
main { width:min(1180px,100%); margin:auto; padding:24px; }
header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
h1,h2,p { margin-top:0; }
h1 { margin-bottom:4px; font-size:26px; letter-spacing:.03em; }
h2 { font-size:13px; color:var(--muted); letter-spacing:.12em; text-transform:uppercase; }
.subtle,.empty { color:var(--muted); }
.grid { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr); gap:16px; }
.panel { border:1px solid var(--line); border-radius:18px; background:rgba(13,20,35,.88); box-shadow:0 18px 60px rgba(0,0,0,.24); padding:18px; }
.summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:14px 0 18px; }
.metric { padding:13px; border:1px solid var(--line); border-radius:14px; background:rgba(5,10,20,.5); }
.metric strong { display:block; font-size:22px; color:var(--accent); }
.list { display:flex; flex-direction:column; gap:9px; }
.item { border:1px solid var(--line); border-radius:13px; padding:11px 12px; background:rgba(8,14,26,.72); overflow-wrap:anywhere; }
.item-head { display:flex; justify-content:space-between; gap:10px; }
.badge { color:var(--good); font-size:11px; letter-spacing:.09em; text-transform:uppercase; }
.notice { border-left:3px solid var(--accent); padding:10px 12px; border-radius:8px; background:rgba(98,216,255,.08); color:var(--muted); }
.error { border-left-color:var(--bad); color:#ffd7df; }
form { display:grid; gap:10px; }
label { display:grid; gap:5px; color:var(--muted); }
input,textarea { width:100%; border:1px solid var(--line); border-radius:11px; background:#080d18; color:var(--text); padding:10px 11px; font:inherit; }
textarea { min-height:96px; resize:vertical; }
button { border:1px solid #399ed0; border-radius:11px; background:linear-gradient(#168fd0,#1168a1); color:white; padding:9px 13px; font-weight:700; cursor:pointer; }
button.secondary { border-color:var(--line); background:#101b2e; }
button:disabled { cursor:not-allowed; opacity:.55; }
.actions { display:flex; gap:8px; }
body.embedded main { padding:14px; }
body.embedded header { margin-bottom:12px; }
@media (max-width:760px) { main { padding:14px; } .grid { grid-template-columns:1fr; } .summary { grid-template-columns:1fr; } header { flex-direction:column; } }
`;
