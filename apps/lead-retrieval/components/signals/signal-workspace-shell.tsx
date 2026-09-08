import { BackLink } from "@/components/navigation/back-link";

type Props = {
  libraryBasePath: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** `wide`: roomier centered column (~80rem cap, ~90vw) for multi-section builders */
  layout?: "default" | "wide";
};

const shellLayoutClass: Record<NonNullable<Props["layout"]>, string> = {
  default: "mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 lg:px-8",
  wide: "mx-auto w-full max-w-[min(80rem,92vw)] px-4 pb-16 pt-8 sm:px-8 lg:px-12"
};

export function SignalWorkspaceShell({ libraryBasePath, title, description, children, layout = "default" }: Props) {
  return (
    <div className={shellLayoutClass[layout]}>
      <nav aria-label="Back">
        <BackLink href={libraryBasePath}>
          <span aria-hidden>←</span> Back to Campaign Agents
        </BackLink>
      </nav>
      <header className="mt-6 border-b border-slate-200/90 pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-lg text-slate-600">{description}</p> : null}
      </header>
      <div className="mt-8">{children}</div>
    </div>
  );
}
