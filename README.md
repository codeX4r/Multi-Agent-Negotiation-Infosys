# Multi-Agent Negotiation Simulator

## Project Statement

Negotiation is a critical component of business operations, procurement,
sales, contract discussions, and strategic decision-making. Training
individuals in negotiation skills is difficult due to the lack of
realistic, scalable, and repeatable simulation environments.

The objective of this project is to develop a Multi-Agent Negotiation
Simulator powered by Generative AI, where multiple autonomous
LLM-powered agents represent different stakeholders with unique goals,
constraints, and negotiation personalities.

The platform operates in two modes:

-   **Simulation Mode:** The user observes AI agents negotiate with each
    other.
-   **Practice Mode:** The user participates directly as one of the
    negotiating parties against AI agents.

An Orchestrator Agent manages turn-taking, tracks negotiation state, and
handles deadlocks.

The platform ships with three pre-built scenario templates:

1.  Vendor pricing negotiation
2.  Job offer negotiation
3.  Project budget allocation

The UI centers around a **Negotiation Arena** --- a chat-style
transcript interface with live agent stance indicators and negotiation
metrics. Users configure agent personas, goals, and personalities before
starting, and receive a structured outcome report at the end.

The platform provides an engaging environment for studying negotiation
dynamics and practicing negotiation skills against intelligent AI
agents.

## Outcomes

1.  Develop a multi-agent simulation where autonomous LLM-powered agents
    negotiate with unique personas, objectives, and negotiation
    personalities.
2.  Support Simulation Mode (AI vs AI) and Practice Mode (Human vs AI)
    within a clean, chat-style negotiation interface.
3.  Implement three pre-built negotiation scenario templates for
    immediate use without manual configuration.
4.  Provide structured outcome analysis including agreement terms,
    concession patterns, and per-agent performance.

## Modules to be Implemented

1.  Scenario Selection and Agent Configuration Module
2.  Orchestrator Agent and Negotiation Turn Management Module
3.  LLM-Powered Agent Reasoning and Offer Generation Engine
4.  Counteroffer Evaluation and Concession Decision Module
5.  Deadlock Detection and Resolution Module
6.  Negotiation Arena UI --- Chat Transcript and Live Metrics Panel
7.  Human Participant Interface (Practice Mode)
8.  Outcome Evaluation and Report Generation Module

## Milestones

### Milestone 1 (Week 1--2 \| \~10 Hours)

1.  Study negotiation theory, multi-agent design patterns, and LLM-based
    agent reasoning.
2.  Design system architecture, orchestration flow, agent persona model,
    and UI wireframes.
3.  Implement scenario selection module with three pre-built templates
    --- define agents, roles, goals, and constraints per scenario.
4.  Build agent configuration screen --- role cards with personality
    selection (aggressive, collaborative, risk-averse) and goal display.

### Milestone 2 (Week 3--4 \| \~10 Hours)

1.  Develop Orchestrator Agent --- manages turn order, passes
    negotiation history, tracks current state and round count.
2.  Implement LLM-Powered Agent Reasoning Engine --- each agent receives
    its persona, goals, and full conversation history to generate
    contextually reasoned offers.
3.  Build Counteroffer Evaluation and Concession Module --- agent
    evaluates incoming offer against its objectives and decides to
    accept, counter, or reject.
4.  Test end-to-end AI vs AI negotiation loop across all three scenario
    templates.

### Milestone 3 (Week 5--6 \| \~10 Hours)

1.  Build Negotiation Arena UI --- chat-style transcript with per-turn
    agent reasoning display, live stance indicators, and round metrics
    panel.
2.  Implement Human Participant Interface for Practice Mode --- user
    types offers and responses, AI agents react intelligently in real
    time.
3.  Develop Deadlock Detection Module --- identifies stalled
    negotiations after N rounds and triggers resolution or declares
    breakdown.
4.  Validate Practice Mode across all three scenarios ensuring AI agents
    respond realistically to human inputs.

### Milestone 4 (Week 7--8 \| \~10 Hours)

1.  Build Outcome Screen --- displays final agreement terms, concession
    timeline, rounds elapsed, and per-agent objective satisfaction
    score.
2.  Implement downloadable negotiation transcript and summary report.
3.  Conduct end-to-end testing across both modes, all scenarios, and all
    personality combinations.
4.  Prepare technical documentation, project report, and final
    demonstration.
