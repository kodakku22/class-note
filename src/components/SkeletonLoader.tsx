// Skeleton loaders with shimmer animation.

export function SkeletonLine({ width = '100%' }: { width?: string }) {
  return <div className="skeleton-line" style={{ width }} aria-hidden />;
}

export function SkeletonNote() {
  return (
    <div className="skeleton-note" aria-busy="true" aria-label="読み込み中">
      <SkeletonLine width="60%" />
      <SkeletonLine width="92%" />
      <SkeletonLine width="78%" />
      <SkeletonLine width="84%" />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-busy="true">
      <SkeletonLine width="50%" />
      <SkeletonLine width="92%" />
      <SkeletonLine width="86%" />
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="skeleton-card-grid">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
