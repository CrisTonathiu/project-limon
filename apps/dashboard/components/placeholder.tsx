export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <>
      <h1>{title}</h1>
      <p className="muted">{description}</p>
      <span className="badge">Not implemented in foundation phase</span>
    </>
  );
}
