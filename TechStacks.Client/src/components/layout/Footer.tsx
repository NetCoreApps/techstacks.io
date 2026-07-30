import Link from 'next/link';
import routes from '@/lib/utils/routes';

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-8 border-t border-gray-800">
      <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-sm">
          &copy; {new Date().getFullYear()} TechStacks. All rights reserved.
        </div>
        <div className="flex items-center space-x-6 text-sm">
          <Link href={routes.home()} className="hover:text-white transition-colors">
            Home
          </Link>
          <Link href={routes.top()} className="hover:text-white transition-colors">
            Top
          </Link>
          <Link href={routes.stack()} className="hover:text-white transition-colors">
            Stacks
          </Link>
          <Link href={routes.tech()} className="hover:text-white transition-colors">
            Technologies
          </Link>
          <a
            href={routes.sitemap()}
            className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            Sitemap
          </a>
        </div>
      </div>
    </footer>
  );
}
