import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useBalance, useBuyerUsage } from '../../hooks/queries';
import { useAuthorizedWallet } from '../../context/authorized-wallet-context';
import { useAppShell } from '../../context/app-shell-context';

const DISMISSED_KEY = 'antseed.gettingStarted.dismissed';
const COLLAPSED_KEY = 'antseed.gettingStarted.collapsed';

type StepStatus = 'done' | 'todo';

interface Step {
  id: 'connect' | 'deposit' | 'authorize' | 'request';
  label: string;
  status: StepStatus;
  action?: { label: string; onClick: () => void };
}

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    // localStorage unavailable — ignore
  }
}

function CircleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CircleCheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 8.2L7.2 10.4L11.2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CaretIcon() {
  return (
    <svg width="9" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
      <path d="M1 5L5 1L9 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function GettingStarted() {
  const { isConnected } = useAccount();
  const { data: balance = null } = useBalance();
  const { data: usage = null } = useBuyerUsage();
  const { operatorSet, requireAuthorization } = useAuthorizedWallet();
  const { openDeposit, openHowItWorks } = useAppShell();

  const [dismissed, setDismissed] = useState<boolean>(() => readFlag(DISMISSED_KEY));
  const [collapsed, setCollapsed] = useState<boolean>(() => readFlag(COLLAPSED_KEY));

  const steps = useMemo<Step[]>(() => {
    const hasBalance = balance !== null && parseFloat(balance.total) > 0;
    const hasRequest = (usage?.totalRequests ?? 0) > 0;
    return [
      {
        id: 'connect',
        label: 'Connect wallet',
        status: isConnected ? 'done' : 'todo',
      },
      {
        id: 'deposit',
        label: 'Deposit USDC',
        status: hasBalance ? 'done' : 'todo',
        action: hasBalance ? undefined : { label: 'Deposit', onClick: openDeposit },
      },
      {
        id: 'authorize',
        label: 'Authorize wallet',
        status: operatorSet === true ? 'done' : 'todo',
        action:
          operatorSet === false ? { label: 'Authorize', onClick: () => requireAuthorization() } : undefined,
      },
      {
        id: 'request',
        label: 'Route a request',
        status: hasRequest ? 'done' : 'todo',
        action: hasRequest ? undefined : { label: 'How', onClick: openHowItWorks },
      },
    ];
  }, [isConnected, balance, usage, operatorSet, requireAuthorization, openDeposit, openHowItWorks]);

  const completed = steps.filter((s) => s.status === 'done').length;
  const total = steps.length;
  const allDone = completed === total;

  useEffect(() => {
    if (allDone) writeFlag(COLLAPSED_KEY, true);
  }, [allDone]);

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    writeFlag(DISMISSED_KEY, true);
  }
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeFlag(COLLAPSED_KEY, next);
      return next;
    });
  }

  // ── All done: collapse to a single celebration row with a dismiss × ───
  // No point keeping a list of lined-through items visible once the user
  // has finished — they've done the work, just acknowledge and get out of
  // the way.
  if (allDone) {
    return (
      <div className="gs gs--done" aria-label="Getting started checklist (all set)">
        <div className="gs-finished">
          <span className="gs-finished-eyebrow">All set</span>
          <span className="gs-finished-count">
            <span className="gs-finished-count-num">{total}</span>
            <span className="gs-finished-count-of">/{total}</span>
          </span>
          <span className="gs-finished-dots" aria-hidden="true">
            {steps.map((step) => (
              <span key={step.id} className="gs-dot gs-dot--done" />
            ))}
          </span>
          <button
            type="button"
            className="gs-finished-close"
            onClick={handleDismiss}
            aria-label="Hide checklist"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gs" aria-label="Getting started checklist">
      <button
        type="button"
        className="gs-header"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls="gs-body"
      >
        <span className="gs-header-eyebrow">Get started</span>
        <span className="gs-header-count">
          <span className="gs-header-count-num">{completed}</span>
          <span className="gs-header-count-of">/{total}</span>
        </span>
        <span className="gs-header-dots" aria-hidden="true">
          {steps.map((step) => (
            <span
              key={step.id}
              className={`gs-dot${step.status === 'done' ? ' gs-dot--done' : ''}`}
            />
          ))}
        </span>
        <span className={`gs-caret${collapsed ? '' : ' gs-caret--up'}`} aria-hidden="true">
          <CaretIcon />
        </span>
      </button>

      {!collapsed && (
        <div id="gs-body" className="gs-body">
          <ul className="gs-steps">
            {steps.map((step) => (
              <li key={step.id} className={`gs-step gs-step--${step.status}`}>
                <span className="gs-step-marker" aria-hidden="true">
                  {step.status === 'done' ? <CircleCheckIcon /> : <CircleIcon />}
                </span>
                <span className="gs-step-label">{step.label}</span>
                {step.action && (
                  <button
                    type="button"
                    className="gs-step-action"
                    onClick={step.action.onClick}
                  >
                    {step.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="gs-foot">
            <button type="button" className="gs-link" onClick={openHowItWorks}>
              How AntSeed works
            </button>
            <button type="button" className="gs-dismiss" onClick={handleDismiss}>
              Hide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
