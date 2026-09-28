export function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 md:left-64 z-30 h-12 flex items-center justify-center gap-1 border-t border-gray-200 bg-white/90 backdrop-blur-sm text-xs text-gray-500">
      <span>Powered by</span>
      <a
        href="https://www.botivate.in/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hover:from-blue-700 hover:to-purple-700 transition-all duration-200 hover:scale-105"
      >
        Botivate
        <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    </footer>
  );
}
