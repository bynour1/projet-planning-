// Calendar is now merged into Planning page (vue Mois)
import { Navigate } from 'react-router-dom';
export default function Calendar() {
  return <Navigate to="/planning" replace />;
}
