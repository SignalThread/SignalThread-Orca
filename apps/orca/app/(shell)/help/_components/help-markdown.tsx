import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

function withoutNode<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const { node, ...rest } = props;
  void node;
  return rest;
}

const components: Components = {
  h2: (props) => <h2 className="mt-11 scroll-mt-24 border-t border-slate-100 pt-8 text-[21px] font-semibold leading-7 text-slate-950 first:mt-0 first:border-0 first:pt-0" {...withoutNode(props)} />,
  h3: (props) => <h3 className="mt-8 scroll-mt-24 text-[16px] font-semibold leading-6 text-slate-950" {...withoutNode(props)} />,
  p: (props) => <p className="mt-4 text-[15px] leading-7 text-slate-700" {...withoutNode(props)} />,
  ul: (props) => <ul className="mt-4 list-disc space-y-2 pl-6 text-[15px] leading-7 text-slate-700 marker:text-slate-400" {...withoutNode(props)} />,
  ol: (props) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-slate-700 marker:font-semibold marker:text-slate-500" {...withoutNode(props)} />,
  li: (props) => <li className="pl-1" {...withoutNode(props)} />,
  strong: (props) => <strong className="font-semibold text-slate-950" {...withoutNode(props)} />,
  em: (props) => <em className="italic" {...withoutNode(props)} />,
  blockquote: (props) => <blockquote className="mt-5 border-l-4 border-[#28439A]/40 bg-slate-50 px-4 py-1" {...withoutNode(props)} />,
  hr: (props) => <hr className="my-8 border-slate-200" {...withoutNode(props)} />,
  a: (componentProps) => {
    const { href = "", ...props } = withoutNode(componentProps);
    const external = /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        className="rounded-sm font-medium text-[#28439A] underline decoration-[#28439A]/30 underline-offset-2 hover:decoration-[#28439A] focus:outline-none focus:ring-2 focus:ring-[#28439A]/20"
        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
        {...props}
      />
    );
  },
  img: (componentProps) => {
    const { src = "", alt = "", ...props } = withoutNode(componentProps);
    if (typeof src !== "string" || !src.startsWith("/help/screenshots/")) return null;
    return (
      <span className="mt-6 block max-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {/* Documentation screenshots have source-controlled paths and variable dimensions. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" decoding="async" className="h-auto w-full max-w-full" {...props} />
      </span>
    );
  },
  table: (componentProps) => {
    const { children, ...props } = withoutNode(componentProps);
    return (
    <div className="mt-5 max-w-full overflow-x-auto rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#28439A]/20" tabIndex={0} aria-label="Scrollable table">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm" {...props}>{children}</table>
    </div>
  ); },
  th: (props) => <th className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-900" {...withoutNode(props)} />,
  td: (props) => <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700" {...withoutNode(props)} />,
  pre: (props) => <pre className="mt-5 max-w-full overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#28439A]/20" tabIndex={0} {...withoutNode(props)} />,
  code: (componentProps) => {
    const { className, ...props } = withoutNode(componentProps);
    return (
    <code className={className ? `${className} font-mono` : "rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-900"} {...props} />
  ); },
};

export function HelpMarkdown({ markdown }: { markdown: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>{markdown}</ReactMarkdown>;
}
