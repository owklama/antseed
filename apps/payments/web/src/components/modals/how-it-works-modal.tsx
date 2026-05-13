import { useCallback, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, WalletAdd01Icon } from '@hugeicons/core-free-icons';
import { ActionModal } from './action-modal';
import { useAppShell } from '../../context/app-shell-context';

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HowItWorksModal({ isOpen, onClose }: HowItWorksModalProps) {
  const { openDeposit } = useAppShell();

  const handleStart = useCallback(() => {
    onClose();
    openDeposit();
  }, [onClose, openDeposit]);

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      title="How AntSeed works"
      subtitle="A peer-to-peer network for AI services — fund once, route anywhere, pay per request."
      variant="wide"
    >
      <div className="hiw">
        <ol className="hiw-steps" aria-label="How AntSeed works">
          <HiwStep
            index={1}
            eyebrow="Fund"
            title="Deposit USDC, once."
            body="Top up your AntSeed account with USDC on Base. The smart contract holds the balance; nothing leaves it without your signature."
            tags={['USDC', 'Base network', 'From $1']}
            glyph={<DepositGlyph />}
          />
          <HiwStep
            index={2}
            eyebrow="Route"
            title="The network picks the best peer."
            body="Each request fans out to providers across the network. AntSeed routes by price, latency, and capability — you keep one credit balance, not ten."
            tags={['Many providers', 'One balance', 'No lock-in']}
            glyph={<RouteGlyph />}
          />
          <HiwStep
            index={3}
            eyebrow="Settle"
            title="Pay only for what you use."
            body="Each request signs a tiny streaming payment. Sellers settle on-chain in their own time. Stop any time and withdraw the unused balance — your USDC, your keys."
            tags={['Per-request', 'No subscription', 'Withdraw any time']}
            glyph={<StreamGlyph />}
          />
        </ol>

        <p className="hiw-note">
          Your signer never holds funds — it authorizes spending from a balance that always belongs to you.
        </p>
        <button type="button" className="rh-cta" onClick={handleStart}>
          <HugeiconsIcon icon={WalletAdd01Icon} size={14} strokeWidth={1.8} />
          <span>Start with a deposit</span>
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
        </button>
      </div>
    </ActionModal>
  );
}

interface HiwStepProps {
  index: number;
  eyebrow: string;
  title: string;
  body: string;
  tags: string[];
  glyph: ReactNode;
}

function HiwStep({ index, eyebrow, title, body, tags, glyph }: HiwStepProps) {
  return (
    <li className="hiw-step" style={{ '--hiw-delay': `${index * 70}ms` } as React.CSSProperties}>
      <div className="hiw-step-rail" aria-hidden="true">
        <span className="hiw-step-num">{String(index).padStart(2, '0')}</span>
        <span className="hiw-step-line" />
      </div>
      <div className="hiw-step-body">
        <div className="hiw-step-eyebrow">{eyebrow}</div>
        <h3 className="hiw-step-title">{title}</h3>
        <p className="hiw-step-text">{body}</p>
        <ul className="hiw-step-tags">
          {tags.map((tag) => (
            <li key={tag} className="hiw-step-tag">{tag}</li>
          ))}
        </ul>
      </div>
      <div className="hiw-step-glyph" aria-hidden="true">{glyph}</div>
    </li>
  );
}

/* ── Bespoke glyphs ──────────────────────────────────────────────
 * Drawn once for AntSeed — a coin falling into a vault for "Fund",
 * a routing fan-out for "Route", and a streaming receipt for "Settle".
 * Strokes use currentColor so they invert with the theme.
 * ───────────────────────────────────────────────────────────────── */

function DepositGlyph() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hiw-coin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="10" y="38" width="52" height="22" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 44 H62" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" opacity="0.55" />
      <circle cx="36" cy="20" r="9" fill="url(#hiw-coin)" stroke="currentColor" strokeWidth="1.2" />
      <text x="36" y="24" textAnchor="middle" fontSize="9" fontFamily="Inter, system-ui" fontWeight="700" fill="#0a1f12">$</text>
      <path d="M36 30 V37.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M33 35 L36 38 L39 35" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 52 L20.5 49.5 L23 52 L20.5 54.5 Z" fill="currentColor" opacity="0.18" />
      <path d="M49 50 L51.5 47.5 L54 50 L51.5 52.5 Z" fill="currentColor" opacity="0.12" />
    </svg>
  );
}

function RouteGlyph() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="36" r="5" fill="var(--accent)" />
      <circle cx="14" cy="36" r="9" stroke="var(--accent)" strokeWidth="1" opacity="0.35" />
      <path d="M19 36 Q34 16 56 16" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M19 36 Q34 28 56 30" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M19 36 Q34 36 56 44" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.55" />
      <path d="M19 36 Q34 50 56 58" stroke="currentColor" strokeWidth="1.4" fill="none" opacity="0.4" />
      <circle cx="58" cy="16" r="3.2" fill="var(--page-bg)" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="58" cy="30" r="3.2" fill="var(--page-bg)" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="58" cy="44" r="3.2" fill="var(--page-bg)" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="58" cy="58" r="3.2" fill="var(--page-bg)" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function StreamGlyph() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="18" width="52" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 26 H62" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <path d="M16 33 H44" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <path d="M16 39 H38" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      <path d="M16 45 H50" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.35" />
      <circle cx="54" cy="33" r="2.4" fill="var(--accent)" />
      <circle cx="48" cy="39" r="2.4" fill="var(--accent)" opacity="0.7" />
      <circle cx="56" cy="45" r="2.4" fill="var(--accent)" opacity="0.45" />
      <path d="M22 22 L22 18 M30 22 L30 18 M38 22 L38 18" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}
