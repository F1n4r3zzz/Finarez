import { Link } from 'react-router';

export function Wordmark() {
  return (
    <Link
      to="/"
      className="text-2xl font-extrabold tracking-tight text-brand [font-stretch:80%] rounded-sm"
    >
      Finanz
    </Link>
  );
}
