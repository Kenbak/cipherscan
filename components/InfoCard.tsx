interface InfoCardProps {
  emoji: string;
  title: string;
  description: string;
  example: string;
}

export function InfoCard({ emoji, title, description, example }: InfoCardProps) {
  return (
    <div className="card text-center group hover:scale-105 transition-all duration-300 cursor-default">
      <div className="text-5xl mb-4 transform group-hover:scale-110 transition-transform">{emoji}</div>
      <h3 className="text-xl font-bold font-mono text-cipher-cyan mb-3 uppercase tracking-wide">{title}</h3>
      <p className="text-secondary mb-4 leading-relaxed">{description}</p>
      <code className="text-xs font-mono learn-code-block px-3 py-2 rounded border border-cipher-border text-cipher-green inline-block">
        {example}
      </code>
    </div>
  );
}
