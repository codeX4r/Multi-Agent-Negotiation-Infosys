import { Handshake, CircleHelp, Settings2 } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="/">
        <span className="brandMark"><Handshake size={22} /></span>
        <span><b>NEGOTIATION ARENA</b><small>Multi-agent training environment</small></span>
      </a>
      <div className="topActions">
        <span className="status"><i /> Frontend workspace</span>
        <button className="iconButton" aria-label="Settings"><Settings2 size={17} /></button>
        <button className="iconButton" aria-label="Help"><CircleHelp size={17} /></button>
      </div>
    </header>
    {children}
    <footer>NEGOTIATION ARENA <span>·</span> Next.js frontend · FastAPI integration ready</footer>
  </main>;
}
