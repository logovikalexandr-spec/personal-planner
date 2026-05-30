import { ProjectTreePanel } from "../components/ProjectTreePanel";
import type { ActiveList } from "../types";

export function Lists({
  active, onSelect,
}: { active: ActiveList; onSelect: (a: ActiveList) => void }) {
  return (
    <div className="screen lists">
      <div className="screen-hero"><h1>Списки</h1></div>
      <ProjectTreePanel
        active={active}
        onSelect={onSelect}
        variant="screen"
        onDragActiveChange={() => {}}
      />
    </div>
  );
}
