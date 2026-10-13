export function Footer() {
  return (
    <footer className="flex h-10 shrink-0 items-center justify-center gap-1 border-t bg-card text-xs text-muted-foreground">
      <span>Powered by</span>
      <a
        href="https://www.botivate.in/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Botivate
      </a>
    </footer>
  );
}
