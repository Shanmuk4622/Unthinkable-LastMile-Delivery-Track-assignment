import { Link } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-mesh px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="card-glass px-8 py-12">
          <span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-route text-white shadow-glow">
            <Compass className="h-8 w-8" />
          </span>

          <p className="font-mono text-5xl font-extrabold text-gradient">404</p>
          <h1 className="mt-3 text-xl font-bold text-ink-900">This route does not exist</h1>
          <p className="mt-2 text-sm text-ink-500">
            The page you asked for is not on any of our maps.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Link to="/" className="btn-primary">
              <Home className="h-4 w-4" />
              Back home
            </Link>
            <Link to="/track" className="btn-secondary">
              <Search className="h-4 w-4" />
              Track a shipment
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
