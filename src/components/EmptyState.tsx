export default function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-16 px-6 text-ink-500">
      <p className="text-base font-medium text-ink-700 mb-1">{title}</p>
      <p className="text-sm">{body}</p>
    </div>
  );
}
