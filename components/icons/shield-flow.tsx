import type { ReactNode, SVGProps } from 'react';

export type ShieldFlowType = 'shielded' | 'shielding' | 'unshielding' | 'mixed';

export const SHIELD_FLOW_LABELS: Record<ShieldFlowType, string> = {
  shielded: 'Shielded',
  shielding: 'Shielding',
  unshielding: 'Unshielding',
  mixed: 'Mixed',
};

export const SHIELD_FLOW_COLORS: Record<ShieldFlowType, string> = {
  shielded: 'text-cipher-purple',
  shielding: 'text-cipher-green',
  unshielding: 'text-cipher-orange',
  mixed: 'text-muted',
};

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 20, className = '', children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function ShieldedIcon({ size = 20, className = '', ...props }: IconProps) {
  return (
    <IconBase size={size} className={className} {...props}>
      <path
        d="M3.783 2.826L12 1L20.217 2.826C20.4391 2.87536 20.6377 2.99897 20.78 3.1764C20.9224 3.35384 21 3.57452 21 3.802V13.789C20.9999 14.7767 20.756 15.7492 20.2899 16.62C19.8238 17.4908 19.1499 18.2331 18.328 18.781L12 23L5.672 18.781C4.85027 18.2332 4.17646 17.4911 3.71035 16.6205C3.24424 15.7498 3.00024 14.7776 3 13.79V3.802C3.00004 3.57452 3.07764 3.35384 3.21999 3.1764C3.36234 2.99897 3.56094 2.87536 3.783 2.826ZM5 4.604V13.789C5.00001 14.4475 5.16257 15.0957 5.47326 15.6763C5.78395 16.2568 6.23315 16.7517 6.781 17.117L12 20.597L17.219 17.117C17.7667 16.7518 18.2158 16.2571 18.5265 15.6767C18.8372 15.0964 18.9998 14.4483 19 13.79V4.604L12 3.05L5 4.604Z"
        fill="currentColor"
      />
    </IconBase>
  );
}

export function ShieldingIcon({ size = 20, className = '', ...props }: IconProps) {
  return (
    <IconBase size={size} className={className} {...props}>
      <path
        d="M12.3536 16.3536C12.1583 16.5488 11.8417 16.5488 11.6464 16.3536L8.46447 13.1716C8.2692 12.9763 8.2692 12.6597 8.46447 12.4645C8.65973 12.2692 8.97631 12.2692 9.17157 12.4645L12 15.2929L14.8284 12.4645C15.0237 12.2692 15.3403 12.2692 15.5355 12.4645C15.7308 12.6597 15.7308 12.9763 15.5355 13.1716L12.3536 16.3536ZM12 6L12.5 6L12.5 16L12 16L11.5 16L11.5 6L12 6Z"
        fill="currentColor"
      />
      <path
        d="M20.1084 3.31445C20.2194 3.33912 20.3185 3.40064 20.3896 3.48926C20.4608 3.57789 20.4999 3.68813 20.5 3.80176V13.7891C20.4999 14.6944 20.2759 15.5856 19.8486 16.3838C19.4214 17.1821 18.8042 17.863 18.0508 18.3652L12 22.3984L5.94922 18.3652C5.19607 17.8632 4.57863 17.1827 4.15137 16.3848C3.72412 15.5867 3.50024 14.6953 3.5 13.79V3.80176L3.50684 3.71777C3.52108 3.63455 3.55694 3.55583 3.61035 3.48926C3.68152 3.40064 3.78065 3.33912 3.8916 3.31445L12 1.51172L20.1084 3.31445ZM19.5 4.20312L19.1084 4.11621L12.1084 2.56152L12 2.53809L11.8916 2.56152L4.8916 4.11621L4.5 4.20312V13.7891C4.50002 14.5298 4.68277 15.259 5.03223 15.9121C5.38175 16.5652 5.88757 17.1223 6.50391 17.5332L11.7227 21.0127L12 21.1982L12.2773 21.0127L17.4961 17.5332C18.1122 17.1224 18.6183 16.566 18.9678 15.9131C19.3173 15.2602 19.4998 14.5306 19.5 13.79V4.20312Z"
        fill="currentColor"
        stroke="currentColor"
      />
    </IconBase>
  );
}

export function UnshieldingIcon({ size = 20, className = '', ...props }: IconProps) {
  return (
    <IconBase size={size} className={className} {...props}>
      <path
        d="M3.783 2.826L12 1L20.217 2.826C20.4391 2.87536 20.6377 2.99897 20.78 3.1764C20.9224 3.35384 21 3.57452 21 3.802V13.789C20.9999 14.7767 20.756 15.7492 20.2899 16.62C19.8238 17.4908 19.1499 18.2331 18.328 18.781L12 23L5.672 18.781C4.85027 18.2332 4.17646 17.4911 3.71035 16.6205C3.24424 15.7498 3.00024 14.7776 3 13.79V3.802C3.00004 3.57452 3.07764 3.35384 3.21999 3.1764C3.36234 2.99897 3.56094 2.87536 3.783 2.826ZM5 4.604V13.789C5.00001 14.4475 5.16257 15.0957 5.47326 15.6763C5.78395 16.2568 6.23315 16.7517 6.781 17.117L12 20.597L17.219 17.117C17.7667 16.7518 18.2158 16.2571 18.5265 15.6767C18.8372 15.0964 18.9998 14.4483 19 13.79V4.604L12 3.05L5 4.604Z"
        fill="currentColor"
      />
      <path
        d="M11.6464 5.64645C11.8417 5.45118 12.1583 5.45118 12.3536 5.64645L15.5355 8.82843C15.7308 9.02369 15.7308 9.34027 15.5355 9.53553C15.3403 9.7308 15.0237 9.7308 14.8284 9.53553L12 6.70711L9.17157 9.53553C8.97631 9.7308 8.65973 9.7308 8.46447 9.53553C8.2692 9.34027 8.2692 9.02369 8.46447 8.82843L11.6464 5.64645ZM12 16L11.5 16L11.5 6L12 6L12.5 6L12.5 16L12 16Z"
        fill="currentColor"
      />
    </IconBase>
  );
}

export function ShieldFlowIcon({ type, size = 20, className = '' }: { type: ShieldFlowType; size?: number; className?: string }) {
  const colorClass = SHIELD_FLOW_COLORS[type];
  const merged = `${colorClass} ${className}`.trim();

  if (type === 'shielding') return <ShieldingIcon size={size} className={merged} />;
  if (type === 'unshielding') return <UnshieldingIcon size={size} className={merged} />;
  if (type === 'shielded') return <ShieldedIcon size={size} className={merged} />;
  return null;
}

/** Map API / table row fields to a shield flow type. */
export function resolveShieldFlowType(input: {
  flowType?: string | null;
  type?: 'fully-shielded' | 'partial';
  vinCount?: number;
  voutCount?: number;
}): ShieldFlowType {
  const ft = input.flowType?.toLowerCase();
  if (ft === 'shield' || ft === 'shielding') return 'shielding';
  if (ft === 'deshield' || ft === 'deshielding' || ft === 'unshielding') return 'unshielding';
  if (ft === 'fully_shielded' || ft === 'fully-shielded') return 'shielded';
  if (ft === 'mixed') return 'mixed';

  if (input.type === 'fully-shielded') return 'shielded';
  if (input.vinCount != null && input.voutCount != null) {
    if (input.vinCount === 0 && input.voutCount === 0) return 'shielded';
    if (input.vinCount > 0 && input.voutCount === 0) return 'shielding';
    if (input.vinCount === 0 && input.voutCount > 0) return 'unshielding';
  }

  return 'mixed';
}
