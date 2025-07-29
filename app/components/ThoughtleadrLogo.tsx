import Image from 'next/image';

export default function ThoughtleadrLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <div className={className}>
      <Image
        src="/images/thoughtleadr-logo.png" // Change extension if needed (.svg, .jpg, etc.)
        alt="Thoughtleadr"
        width={32}
        height={32}
        className="w-full h-full object-contain"
      />
    </div>
  );
} 