export default function BrandLogo({ className = '', label = 'aura home' }) {
  return (
    <span className={`brand-logo ${className}`.trim()} aria-label={label} role="img">
      <img src="/aura-flame.png" alt="" />
      <span>aura</span>
    </span>
  );
}
