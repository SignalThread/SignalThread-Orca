import Image from "next/image";

export function LeadRetrievalBrandMark({
  className,
  decorative = true
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <Image
      src="/brand/lead-retrieval-logo.png"
      alt={decorative ? "" : "Lead Retrieval"}
      aria-hidden={decorative || undefined}
      width={48}
      height={48}
      sizes="48px"
      className={className ?? "h-full w-full object-contain"}
    />
  );
}
