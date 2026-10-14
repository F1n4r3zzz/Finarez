import { UnderConstruction } from '../../components/UnderConstruction';
import { DashboardView } from './DashboardView';

// Data arrives with the ledger API; until then the page says so and shows its empty state.
export function DashboardPage() {
  return <DashboardView notice={<UnderConstruction scope="app" />} />;
}
