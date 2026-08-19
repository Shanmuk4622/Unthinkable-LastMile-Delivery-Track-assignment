/**
 * Notification templates.
 *
 * One function per lifecycle event returns the e-mail subject, an HTML body and
 * a plain-text body that doubles as the SMS. Keeping all copy here means the
 * tone stays consistent and a product person can edit wording without reading
 * any business logic.
 */
import { env } from '../../config/env';
import { ORDER_STATUS_META, type OrderStatus } from '../../domain/constants';
import { formatMoney } from '../../utils/money';

export interface RenderedMessage {
  subject: string;
  html: string;
  text: string;
  /** Short form for SMS — hard-capped so it stays inside one or two segments. */
  sms: string;
}

export interface OrderSummary {
  code: string;
  customerName: string;
  status: OrderStatus;
  totalCharge: number;
  currency: string;
  pickupCity: string;
  dropCity: string;
  agentName?: string | null;
  agentPhone?: string | null;
  scheduledDate?: Date | null;
  failureReason?: string | null;
  etaText?: string | null;
}

const BRAND = {
  name: 'SwiftRoute',
  tagline: 'Last-mile, handled.',
  gradientFrom: '#6d28d9',
  gradientTo: '#0ea5e9',
  ink: '#0f172a',
  muted: '#64748b',
  surface: '#ffffff',
  page: '#f1f5f9',
};

const TONE_HEX: Record<string, string> = {
  slate: '#64748b',
  violet: '#7c3aed',
  blue: '#2563eb',
  cyan: '#0891b2',
  indigo: '#4f46e5',
  amber: '#d97706',
  emerald: '#059669',
  rose: '#e11d48',
  orange: '#ea580c',
  zinc: '#71717a',
};

export function trackingUrl(code: string): string {
  return `${env.WEB_PUBLIC_URL.replace(/\/$/, '')}/track/${encodeURIComponent(code)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A deliberately old-school table-based shell — inline styles and no external
 * assets, because that is the only thing every mail client renders reliably.
 */
function shell(params: {
  accent: string;
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px 12px;background:${BRAND.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:${BRAND.surface};border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.10);">
      <tr>
        <td style="background:linear-gradient(135deg,${BRAND.gradientFrom},${BRAND.gradientTo});padding:26px 30px;">
          <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-.4px;">⚡ ${BRAND.name}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.82);margin-top:3px;">${BRAND.tagline}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:30px;">
          <div style="display:inline-block;padding:5px 12px;border-radius:999px;background:${params.accent}1a;color:${params.accent};font-size:11px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;">${escapeHtml(params.eyebrow)}</div>
          <h1 style="margin:16px 0 10px;font-size:23px;line-height:1.28;font-weight:800;letter-spacing:-.5px;">${params.heading}</h1>
          ${params.body}
          <a href="${params.ctaUrl}" style="display:inline-block;margin-top:22px;padding:13px 26px;border-radius:12px;background:linear-gradient(135deg,${BRAND.gradientFrom},${BRAND.gradientTo});color:#fff;font-weight:700;font-size:14px;text-decoration:none;">${escapeHtml(params.ctaLabel)}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 30px 26px;border-top:1px solid #e2e8f0;color:${BRAND.muted};font-size:12px;line-height:1.6;">
          ${params.footerNote ? `${params.footerNote}<br/><br/>` : ''}
          You are receiving this because a ${BRAND.name} shipment is registered to this address.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function detailRows(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:separate;border-spacing:0 8px;">
    ${rows
      .map(
        ([label, value]) => `<tr>
          <td style="font-size:13px;color:${BRAND.muted};padding-right:14px;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="font-size:13px;font-weight:650;text-align:right;color:${BRAND.ink};">${escapeHtml(value)}</td>
        </tr>`,
      )
      .join('')}
  </table>`;
}

const p = (text: string): string =>
  `<p style="margin:0 0 10px;font-size:14px;line-height:1.65;color:#334155;">${text}</p>`;

// ---------------------------------------------------------------------------
//  Templates
// ---------------------------------------------------------------------------

export function orderCreatedTemplate(order: OrderSummary): RenderedMessage {
  const url = trackingUrl(order.code);
  const amount = formatMoney(order.totalCharge, order.currency);

  return {
    subject: `Order ${order.code} confirmed — ${amount}`,
    html: shell({
      accent: TONE_HEX.violet,
      eyebrow: 'Booking confirmed',
      heading: `Thanks ${escapeHtml(order.customerName.split(' ')[0])}, your pickup is booked.`,
      body:
        p(
          `We have your shipment from <strong>${escapeHtml(order.pickupCity)}</strong> to <strong>${escapeHtml(order.dropCity)}</strong>. You will get an update at every step of the journey.`,
        ) +
        detailRows([
          ['Tracking number', order.code],
          ['Total charge', amount],
          ['Status', ORDER_STATUS_META[order.status].label],
        ]),
      ctaLabel: 'Track this shipment',
      ctaUrl: url,
    }),
    text: `Order ${order.code} confirmed. ${order.pickupCity} -> ${order.dropCity}. Total ${amount}. Track: ${url}`,
    sms: `SwiftRoute: order ${order.code} confirmed, ${amount}. Track: ${url}`,
  };
}

export function statusChangedTemplate(
  order: OrderSummary,
  from: OrderStatus | null,
): RenderedMessage {
  const meta = ORDER_STATUS_META[order.status];
  const accent = TONE_HEX[meta.tone] ?? TONE_HEX.blue;
  const url = trackingUrl(order.code);

  const rows: Array<[string, string]> = [
    ['Tracking number', order.code],
    ['Status', meta.label],
  ];
  if (from) rows.push(['Previous status', ORDER_STATUS_META[from].label]);
  if (order.agentName) rows.push(['Delivery agent', order.agentName]);
  if (order.etaText) rows.push(['Estimated arrival', order.etaText]);

  return {
    subject: `${order.code} — ${meta.label}`,
    html: shell({
      accent,
      eyebrow: meta.label,
      heading: headingFor(order),
      body: p(meta.description) + detailRows(rows),
      ctaLabel: 'View live tracking',
      ctaUrl: url,
    }),
    text: `Order ${order.code} is now ${meta.label}. ${meta.description} Track: ${url}`,
    sms: `SwiftRoute ${order.code}: ${meta.label}. ${url}`,
  };
}

function headingFor(order: OrderSummary): string {
  const first = escapeHtml(order.customerName.split(' ')[0]);
  switch (order.status) {
    case 'ASSIGNED':
      return order.agentName
        ? `${escapeHtml(order.agentName)} is picking up your parcel`
        : 'A delivery agent has been assigned';
    case 'PICKED_UP':
      return 'Your parcel is on the move';
    case 'IN_TRANSIT':
      return 'Your parcel is travelling to the destination city';
    case 'OUT_FOR_DELIVERY':
      return 'Out for delivery — arriving today';
    case 'DELIVERED':
      return `Delivered. Thanks for shipping with us, ${first}!`;
    case 'CANCELLED':
      return 'Your order has been cancelled';
    default:
      return `Update on order ${escapeHtml(order.code)}`;
  }
}

export function deliveryFailedTemplate(order: OrderSummary): RenderedMessage {
  const url = trackingUrl(order.code);
  const reason = order.failureReason ?? 'The delivery attempt was unsuccessful.';

  return {
    subject: `Action needed — delivery attempt failed for ${order.code}`,
    html: shell({
      accent: TONE_HEX.rose,
      eyebrow: 'Delivery failed',
      heading: 'We could not complete the delivery',
      body:
        p(
          `Our agent attempted delivery but could not hand the parcel over. <strong>Reason: ${escapeHtml(reason)}</strong>`,
        ) +
        p(
          'Your parcel is safe with us. Pick a new date and we will assign a fresh agent for the next attempt.',
        ) +
        detailRows([
          ['Tracking number', order.code],
          ['Attempted', new Date().toLocaleString('en-IN')],
        ]),
      ctaLabel: 'Reschedule my delivery',
      ctaUrl: `${url}?action=reschedule`,
      footerNote:
        'If you do not reschedule within 7 days the shipment is returned to the sender.',
    }),
    text: `Delivery of ${order.code} failed: ${reason}. Reschedule here: ${url}?action=reschedule`,
    sms: `SwiftRoute ${order.code}: delivery failed (${reason}). Reschedule: ${url}`,
  };
}

export function rescheduledTemplate(order: OrderSummary): RenderedMessage {
  const url = trackingUrl(order.code);
  const when = order.scheduledDate
    ? new Date(order.scheduledDate).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : 'the new date you selected';

  return {
    subject: `${order.code} rescheduled for ${when}`,
    html: shell({
      accent: TONE_HEX.orange,
      eyebrow: 'Rescheduled',
      heading: `We will try again on ${escapeHtml(when)}`,
      body:
        p('Your new delivery date is locked in and a delivery agent is being assigned.') +
        detailRows([
          ['Tracking number', order.code],
          ['New delivery date', when],
          ...(order.agentName
            ? ([['Delivery agent', order.agentName]] as Array<[string, string]>)
            : []),
        ]),
      ctaLabel: 'View live tracking',
      ctaUrl: url,
    }),
    text: `Order ${order.code} rescheduled for ${when}. Track: ${url}`,
    sms: `SwiftRoute ${order.code}: rescheduled for ${when}. ${url}`,
  };
}

export function agentAssignedTemplate(order: OrderSummary): RenderedMessage {
  const url = trackingUrl(order.code);
  return {
    subject: `${order.code} — ${order.agentName ?? 'An agent'} is on the way`,
    html: shell({
      accent: TONE_HEX.blue,
      eyebrow: 'Agent assigned',
      heading: `${escapeHtml(order.agentName ?? 'A delivery agent')} will handle your shipment`,
      body:
        p('Your parcel has been allocated to a delivery agent for pickup.') +
        detailRows([
          ['Tracking number', order.code],
          ['Delivery agent', order.agentName ?? '—'],
          ...(order.agentPhone
            ? ([['Contact', order.agentPhone]] as Array<[string, string]>)
            : []),
        ]),
      ctaLabel: 'View live tracking',
      ctaUrl: url,
    }),
    text: `Order ${order.code}: ${order.agentName ?? 'an agent'} assigned. Track: ${url}`,
    sms: `SwiftRoute ${order.code}: ${order.agentName ?? 'an agent'} assigned. ${url}`,
  };
}

export function welcomeTemplate(name: string): RenderedMessage {
  const url = env.WEB_PUBLIC_URL;
  return {
    subject: `Welcome to ${BRAND.name}, ${name.split(' ')[0]}!`,
    html: shell({
      accent: TONE_HEX.emerald,
      eyebrow: 'Welcome aboard',
      heading: `Your ${BRAND.name} account is ready`,
      body: p(
        'Book a pickup in under a minute — we will price it instantly, find the nearest available agent and keep you posted at every step.',
      ),
      ctaLabel: 'Book your first shipment',
      ctaUrl: url,
    }),
    text: `Welcome to ${BRAND.name}, ${name}! Book your first shipment: ${url}`,
    sms: `Welcome to ${BRAND.name}, ${name.split(' ')[0]}! ${url}`,
  };
}
