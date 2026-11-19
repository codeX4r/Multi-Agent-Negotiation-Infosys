const labels = ["Mode", "Scenario", "Setup", "Briefing", "Arena", "Outcome"];
export function Stepper({ active }: { active: number }) {
  return <nav className="stepper" aria-label="Negotiation setup progress">
    {labels.map((label, index) => <div key={label} className={index === active ? "step active" : index < active ? "step done" : "step"}>
      <span>{index + 1}</span>{label}
    </div>)}
  </nav>;
}
