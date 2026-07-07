import { useState } from "react";
import {
  basicFarmScenarios,
  getBasicFarmScenario,
  nextBasicFarmScenarioId,
  previousBasicFarmScenarioId,
  type BasicFarmScenarioId,
} from "@my-farm/game-model/basicFarmScenarios";
import { scenarioPageHref } from "../scenarioRoutes";

type WikiTab = "scenarios" | "glossary";

type GlossaryEntry = {
  term: string;
  definition: string;
  demoOnly?: boolean;
  localOnly?: boolean;
};

const glossaryEntries: GlossaryEntry[] = [
  {
    term: "Field Plot",
    definition: "A tile that holds one planted crop job.",
  },
  {
    term: "Crop",
    definition: "A harvestable and plantable item stored in the Silo.",
  },
  {
    term: "Machine",
    definition: "A structure with a recipe queue for farm products.",
  },
  {
    term: "Demo Farm",
    definition: "A browser-local farm saved on this device.",
    demoOnly: true,
  },
  {
    term: "Delivery Order",
    definition: "A request that pays coins and XP for goods.",
    localOnly: true,
  },
  {
    term: "Storage Upgrade",
    definition: "A coin purchase that raises Silo or Barn capacity after reaching its unlock level.",
    localOnly: true,
  },
];

export function WikiPanel({
  demoMode,
  initialScenarioId,
}: {
  demoMode: boolean;
  initialScenarioId?: BasicFarmScenarioId;
}) {
  const [tab, setTab] = useState<WikiTab>("scenarios");
  const [selectedScenarioId, setSelectedScenarioId] = useState<BasicFarmScenarioId | null>(
    initialScenarioId ?? null,
  );

  return (
    <section className="wiki-panel" aria-label="Wiki pages">
      <div className="wiki-panel__tabs" role="tablist" aria-label="Wiki sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "scenarios"}
          onClick={() => setTab("scenarios")}
        >
          Scenarios
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "glossary"}
          onClick={() => setTab("glossary")}
        >
          Glossary
        </button>
      </div>

      {tab === "scenarios" ? (
        selectedScenarioId ? (
          <ScenarioDetail scenarioId={selectedScenarioId} onSelectScenario={setSelectedScenarioId} />
        ) : (
          <ScenarioIndex onSelectScenario={setSelectedScenarioId} />
        )
      ) : (
        <Glossary demoMode={demoMode} />
      )}
    </section>
  );
}

function ScenarioIndex({ onSelectScenario }: { onSelectScenario: (scenarioId: BasicFarmScenarioId) => void }) {
  return (
    <div className="wiki-panel__scenarios" aria-label="Basic Farm Scenarios">
      <p className="wiki-panel__intro">
        Learn the browser Demo Farm through compact scenarios that name what the player sees, what changes on
        the Farm, and which model terms apply.
      </p>
      <ol className="wiki-panel__scenario-list">
        {basicFarmScenarios.map((scenario) => (
          <li key={scenario.id}>
            <a href={scenarioPageHref(scenario.id)}>
              <span>{scenarioTitle(scenario.number, scenario.title)}</span>
              <small>{scenario.summary}</small>
            </a>
            <button type="button" onClick={() => onSelectScenario(scenario.id)}>
              Read
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScenarioDetail({
  scenarioId,
  onSelectScenario,
}: {
  scenarioId: BasicFarmScenarioId;
  onSelectScenario: (scenarioId: BasicFarmScenarioId | null) => void;
}) {
  const scenario = getBasicFarmScenario(scenarioId);
  const previousId = previousBasicFarmScenarioId(scenarioId);
  const nextId = nextBasicFarmScenarioId(scenarioId);

  return (
    <article className="wiki-scenario">
      <button className="wiki-scenario__all" type="button" onClick={() => onSelectScenario(null)}>
        All Scenarios
      </button>
      <header>
        <span>Scenario {scenario.number.toString().padStart(2, "0")}</span>
        <h3>{scenario.title}</h3>
        <p>{scenario.summary}</p>
        <a className="wiki-scenario__open" href={scenarioPageHref(scenarioId)}>
          Open Scenario
        </a>
      </header>
      <ScenarioSection title="What this teaches" items={scenario.teaches} />
      <ScenarioSection title="Farm setup" items={scenario.farmSetup} />
      <ScenarioSection title="Player steps" items={scenario.playerSteps} ordered />
      <ScenarioSection title="What changes on the farm" items={scenario.farmChanges} />
      <ScenarioSection title="What the model calls this" items={scenario.modelTerms} />
      <ScenarioSection title="Suggested visual callouts" items={scenario.visualCallouts} />
      <ScenarioSection title="Related terms" items={scenario.relatedTerms} compact />
      {scenario.accuracyNotes ? (
        <ScenarioSection title="Accuracy notes" items={scenario.accuracyNotes} />
      ) : null}
      <section className="wiki-scenario__section">
        <h4>Not covered here</h4>
        <p>{scenario.notCovered}</p>
      </section>
      <nav className="wiki-scenario__nav" aria-label="Scenario navigation">
        <button type="button" disabled={!previousId} onClick={() => previousId && onSelectScenario(previousId)}>
          Previous
        </button>
        <button type="button" disabled={!nextId} onClick={() => nextId && onSelectScenario(nextId)}>
          Next
        </button>
      </nav>
    </article>
  );
}

function ScenarioSection({
  title,
  items,
  ordered = false,
  compact = false,
}: {
  title: string;
  items: readonly string[];
  ordered?: boolean;
  compact?: boolean;
}) {
  const List = ordered ? "ol" : "ul";

  return (
    <section className="wiki-scenario__section">
      <h4>{title}</h4>
      <List className={compact ? "wiki-scenario__terms" : undefined}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    </section>
  );
}

function Glossary({ demoMode }: { demoMode: boolean }) {
  const visibleEntries = glossaryEntries.filter((entry) => {
    if (entry.demoOnly) return demoMode;
    if (entry.localOnly) return !demoMode;
    return true;
  });

  return (
    <dl className="main-menu__wiki" aria-label="Farm glossary">
      {visibleEntries.map((entry) => (
        <div key={entry.term}>
          <dt>{entry.term}</dt>
          <dd>{entry.definition}</dd>
        </div>
      ))}
    </dl>
  );
}

function scenarioTitle(number: number, title: string) {
  return `Scenario ${number.toString().padStart(2, "0")}: ${title}`;
}
