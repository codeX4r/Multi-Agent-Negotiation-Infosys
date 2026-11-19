"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Brain, BriefcaseBusiness, Building2, Check, Play, Send, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Stepper } from "@/components/stepper";
import { SCENARIOS } from "@/lib/scenarios";
import type { AgentConfiguration, NegotiationMode, ScenarioId, SessionConfiguration } from "@/types/negotiation";
import { createSession, requestNextAgentTurn, submitParticipantMessage } from "@/features/sessions/session-api";

type Screen = "home" | "mode" | "scenario" | "setup" | "briefing" | "arena";
const scenarioIcons = { vendor_pricing: Building2, job_offer: BriefcaseBusiness, project_budget: Wallet };

const defaultAgents: AgentConfiguration[] = [
  { roleId: "buyer", displayName: "Buyer", personality: "collaborative", skillLevel: "skilled" },
  { roleId: "vendor", displayName: "Vendor", personality: "aggressive", skillLevel: "skilled" },
  { roleId: "finance", displayName: "Finance", personality: "risk_averse", skillLevel: "expert" }
];

export function NegotiationWorkspace() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<NegotiationMode>("simulation");
  const [scenarioId, setScenarioId] = useState<ScenarioId>("vendor_pricing");
  const [climate, setClimate] = useState<SessionConfiguration["climate"]>("stable");
  const [orchestratorRole, setOrchestratorRole] = useState<SessionConfiguration["orchestratorRole"]>("mediator");
  const [autonomy, setAutonomy] = useState<0 | 1 | 2 | 3>(2);
  const [agents, setAgents] = useState<AgentConfiguration[]>(defaultAgents);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ id: string; speaker: string; content: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenario = SCENARIOS.find(item => item.id === scenarioId)!;
  const screenStep = ["mode", "scenario", "setup", "briefing", "arena"].indexOf(screen);
  const config: SessionConfiguration = { scenarioId, mode, climate, orchestratorRole, orchestratorAutonomy: autonomy, agents };

  async function startSession() {
    setBusy(true); setError(null);
    try {
      const created = await createSession(config);
      setSessionId(created.sessionId);
      setTranscript(created.transcript.map(m => ({ id: m.id, speaker: m.speaker, content: m.content })));
      setScreen("arena");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create session. Check that your FastAPI server is running.");
    } finally { setBusy(false); }
  }

  async function refreshWith(action: () => Promise<{ transcript: { id: string; speaker: string; content: string }[] }>) {
    if (!sessionId) return;
    setBusy(true); setError(null);
    try { const updated = await action(); setTranscript(updated.transcript); }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
    finally { setBusy(false); }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!sessionId || !content) return;
    setDraft("");
    await refreshWith(() => submitParticipantMessage(sessionId, content));
  }

  async function nextTurn() {
    if (!sessionId) return;
    await refreshWith(() => requestNextAgentTurn(sessionId));
  }

  function updateAgent(index: number, patch: Partial<AgentConfiguration>) {
    setAgents(current => current.map((agent, i) => i === index ? { ...agent, ...patch } : agent));
  }

  return <AppShell>
    {screen !== "home" && <Stepper active={Math.max(0, screenStep)} />}
    {screen === "home" && <section className="hero">
      <div className="eyebrow"><Brain size={14} /> AI-DRIVEN NEGOTIATION TRAINING</div>
      <h1>Enter the <em>Negotiation Arena.</em></h1>
      <p>Practice difficult conversations, observe competing stakeholders, and understand how offers, concessions and trust shape outcomes.</p>
      <div className="heroActions"><button className="primary" onClick={() => setScreen("mode")}>Start negotiation <ArrowRight size={17} /></button></div>
      <div className="featureGrid">
        <article><Bot /><b>Multi-agent table</b><span>Distinct stakeholders, goals and personalities.</span></article>
        <article><Brain /><b>Orchestrated turns</b><span>Session progression controlled by the backend.</span></article>
        <article><Check /><b>Outcome analysis</b><span>Review negotiated terms and concession patterns.</span></article>
      </div>
    </section>}

    {screen === "mode" && <section className="content">
      <div className="eyebrow">STEP 01 · PARTICIPATION</div><h2>Choose your negotiation mode</h2><p className="muted">Observe an AI negotiation or take a seat at the table.</p>
      <div className="choiceGrid">
        <button className={mode === "simulation" ? "choice selected" : "choice"} onClick={() => setMode("simulation")}><Bot /><b>Simulation Mode</b><span>Watch AI stakeholders negotiate with one another.</span><small>Observer experience</small></button>
        <button className={mode === "practice" ? "choice selected" : "choice"} onClick={() => setMode("practice")}><Users /><b>Practice Mode</b><span>Participate as a negotiating party against AI stakeholders.</span><small>Human participant</small></button>
      </div>
      <div className="footerActions"><button className="secondary" onClick={() => setScreen("home")}><ArrowLeft size={15}/> Back</button><button className="primary" onClick={() => setScreen("scenario")}>Continue <ArrowRight size={15}/></button></div>
    </section>}

    {screen === "scenario" && <section className="content">
      <div className="eyebrow">STEP 02 · SCENARIO</div><h2>Select a negotiation scenario</h2><p className="muted">Choose one of the three pre-built project scenarios.</p>
      <div className="scenarioGrid">{SCENARIOS.map(item => { const Icon = scenarioIcons[item.id]; return <button key={item.id} className={scenarioId === item.id ? "scenario selected" : "scenario"} onClick={() => setScenarioId(item.id)}><span className="scenarioIcon"><Icon/></span><b>{item.name}</b><span>{item.description}</span><small>{item.stakeholderCount} stakeholders · {item.issues.length} issues</small></button>; })}</div>
      <div className="footerActions"><button className="secondary" onClick={() => setScreen("mode")}><ArrowLeft size={15}/> Back</button><button className="primary" onClick={() => setScreen("setup")}>Configure table <ArrowRight size={15}/></button></div>
    </section>}

    {screen === "setup" && <section className="content">
      <div className="eyebrow">STEP 03 · TABLE CONFIGURATION</div><h2>Configure the negotiation table</h2><p className="muted">These settings are sent to FastAPI when a session is created.</p>
      <div className="setupGrid"><div className="panel"><h3>Environment</h3>
        <label>Climate<select value={climate} onChange={e => setClimate(e.target.value as SessionConfiguration["climate"])}><option value="stable">Stable</option><option value="volatile">Volatile</option><option value="crisis">Crisis</option></select></label>
        <label>Orchestrator role<select value={orchestratorRole} onChange={e => setOrchestratorRole(e.target.value as SessionConfiguration["orchestratorRole"])}><option value="timekeeper">Timekeeper</option><option value="mediator">Mediator</option><option value="rule_enforcer">Rule-enforcer</option><option value="auditor">Auditor</option><option value="event_injector">Event-injector</option></select></label>
        <label>Autonomy<select value={autonomy} onChange={e => setAutonomy(Number(e.target.value) as 0|1|2|3)}><option value="0">0 · Guided</option><option value="1">1 · Limited</option><option value="2">2 · Balanced</option><option value="3">3 · High</option></select></label>
      </div><div className="panel"><h3>Agent configuration</h3>{agents.map((agent,index)=><div className="agentConfig" key={agent.roleId}><b>{agent.displayName}</b><label>Personality<select value={agent.personality} onChange={e => updateAgent(index,{personality:e.target.value as AgentConfiguration["personality"]})}><option value="aggressive">Aggressive</option><option value="collaborative">Collaborative</option><option value="risk_averse">Risk-averse</option></select></label><label>Skill level<select value={agent.skillLevel} onChange={e => updateAgent(index,{skillLevel:e.target.value as AgentConfiguration["skillLevel"]})}><option value="novice">Novice</option><option value="skilled">Skilled</option><option value="expert">Expert</option></select></label></div>)}</div></div>
      <div className="footerActions"><button className="secondary" onClick={() => setScreen("scenario")}><ArrowLeft size={15}/> Back</button><button className="primary" onClick={() => setScreen("briefing")}>Review briefing <ArrowRight size={15}/></button></div>
    </section>}

    {screen === "briefing" && <section className="content">
      <div className="eyebrow">STEP 04 · BRIEFING</div><h2>Review the negotiation mandate</h2><p className="muted">The backend should return only the private briefing authorised for the current participant.</p>
      <div className="panel briefing"><div><b>{mode === "practice" ? "Your participant role" : "Observer briefing"}</b><p>{mode === "practice" ? "Your role and private objectives will be loaded from the session API." : "You will observe the public negotiation transcript and session metrics."}</p><h3>Issues in this scenario</h3><ul>{scenario.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p className="notice">Never send other agents' hidden goals, BATNAs or private preferences to the browser.</p></div></div>
      <div className="footerActions"><button className="secondary" onClick={() => setScreen("setup")}><ArrowLeft size={15}/> Back</button><button className="primary" disabled={busy} onClick={startSession}>{busy ? "Creating session..." : "Create session & enter arena"} <ArrowRight size={15}/></button></div>
    </section>}

    {screen === "arena" && <section className="content">
      <div className="arenaHead"><div><div className="eyebrow">LIVE NEGOTIATION</div><h2>{scenario.name}</h2><p className="muted">{mode === "simulation" ? "Simulation Mode · AI vs AI" : "Practice Mode · Human participant"}</p></div><button className="secondary" onClick={() => setScreen("briefing")}>Session setup</button></div>
      {error && <p className="errorBox" role="alert">{error}</p>}
      <div className="panel transcript"><div className="transcriptHead"><b>Negotiation transcript</b><span className="status"><i/> Session view</span></div>
        <div className="messages">{transcript.length ? transcript.map(message => <article className="message" key={message.id}><small>{message.speaker}</small><p>{message.content}</p></article>) : <p className="muted">No transcript messages returned yet.</p>}</div>
        {mode === "practice" ? <div className="composer"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Write your proposal or response..." /><button className="primary send" disabled={busy || !draft.trim()} onClick={sendMessage}><Send size={16}/></button></div> : <div className="composer"><span className="muted">Request the next orchestrated agent turn.</span><button className="primary" disabled={busy} onClick={nextTurn}><Play size={15}/> {busy ? "Processing..." : "Next AI turn"}</button></div>}
      </div>
      <div className="footerActions"><button className="secondary" onClick={() => setScreen("home")}>Exit workspace</button><span className="muted">Session ID: {sessionId ?? "not created"}</span></div>
    </section>}
  </AppShell>;
}
