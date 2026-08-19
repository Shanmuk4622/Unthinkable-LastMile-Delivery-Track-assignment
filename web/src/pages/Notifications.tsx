/**
 * The notification outbox.
 *
 * For a customer this is "my messages". For an admin it is the observability
 * surface for the whole notification pipeline — including the rendered HTML of
 * every e-mail the system decided to send, which is what makes the flow
 * demonstrable on a deployment with no SMTP credentials.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  Server,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { dateTime, relative } from '@/lib/format';
import { PageHeader } from '@/components/layout/AppShell';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Pagination,
  Segmented,
  SkeletonRows,
} from '@/components/ui';
import type { NotificationRecord } from '@/lib/types';

const STATUS_STYLE: Record<string, string> = {
  SENT: 'bg-emerald-100 text-emerald-700',
  QUEUED: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-rose-100 text-rose-700',
  SKIPPED: 'bg-ink-100 text-ink-500',
};

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const [channel, setChannel] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<NotificationRecord | null>(null);

  const notifications = useQuery({
    queryKey: ['notifications', { channel, page }],
    queryFn: () => api.notifications.list({ channel: channel || undefined, page }),
    refetchInterval: 60_000,
  });

  const transports = useQuery({
    queryKey: ['transports'],
    queryFn: api.notifications.transports,
    enabled: isAdmin,
  });

  const retry = useMutation({
    mutationFn: api.notifications.retry,
    onSuccess: (result) => {
      toast.success(
        result.retried ? `Retried ${result.retried} message(s).` : 'Nothing was waiting to retry.',
      );
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Retry failed.'),
  });

  const email = transports.data?.email as { provider: string; live: boolean } | undefined;
  const sms = transports.data?.sms as { provider: string; live: boolean } | undefined;

  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title={isAdmin ? 'Notification outbox' : 'My notifications'}
        subtitle={
          isAdmin
            ? 'Every e-mail and SMS the system produced, with the provider result for each.'
            : 'Everything we have sent you about your shipments.'
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => notifications.refetch()}
            >
              Refresh
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                icon={<Send className="h-3.5 w-3.5" />}
                loading={retry.isPending}
                onClick={() => retry.mutate()}
              >
                Retry failed
              </Button>
            )}
          </>
        }
      />

      {/* transport status */}
      {isAdmin && email && sms && (
        <Alert
          tone={email.live || sms.live ? 'success' : 'info'}
          title={
            email.live || sms.live
              ? 'Live delivery is configured'
              : 'Running in outbox mode — nothing leaves this machine'
          }
          icon={<Server className="h-4 w-4" />}
        >
          <p>
            E-mail via <strong>{email.provider}</strong>
            {email.live ? ' (live)' : ' (persisted only)'} · SMS via{' '}
            <strong>{sms.provider}</strong>
            {sms.live ? ' (live)' : ' (persisted only)'}.
          </p>
          {!email.live && (
            <p className="mt-1.5">
              Set <code className="rounded bg-white/60 px-1 font-mono text-xs">NOTIFY_EMAIL_PROVIDER=smtp</code>{' '}
              with SMTP credentials to send for real — no code changes needed. Messages are still
              rendered and stored, so the whole pipeline is observable right here.
            </p>
          )}
        </Alert>
      )}

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
          <Segmented
            value={channel}
            onChange={(value) => {
              setChannel(value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All channels' },
              { value: 'EMAIL', label: 'E-mail' },
              { value: 'SMS', label: 'SMS' },
            ]}
          />
          <p className="text-xs text-ink-400">
            {notifications.data?.pagination.total ?? 0} message
            {notifications.data?.pagination.total === 1 ? '' : 's'}
          </p>
        </div>

        {notifications.isPending && <SkeletonRows rows={6} />}

        {notifications.data?.items.length === 0 && (
          <EmptyState
            icon={<Bell className="h-8 w-8" />}
            title="No notifications yet"
            description="Messages appear here the moment an order changes status."
          />
        )}

        <ul className="divide-y divide-ink-100">
          {notifications.data?.items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setPreview(item)}
                className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-brand-50/40"
              >
                <span
                  className={clsx(
                    'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                    item.channel === 'EMAIL'
                      ? 'bg-violet-50 text-violet-600'
                      : 'bg-cyan-50 text-cyan-600',
                  )}
                >
                  {item.channel === 'EMAIL' ? (
                    <Mail className="h-5 w-5" />
                  ) : (
                    <MessageSquare className="h-5 w-5" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-ink-900">
                      {item.subject ?? `SMS to ${item.recipient}`}
                    </p>
                    <Badge className={STATUS_STYLE[item.status] ?? 'bg-ink-100 text-ink-500'}>
                      {item.status}
                    </Badge>
                    {item.provider && (
                      <Badge className="bg-ink-100 text-ink-500">{item.provider}</Badge>
                    )}
                  </div>

                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">
                    {item.body}
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
                    <span>{item.recipient}</span>
                    {item.order && (
                      <span className="font-mono font-semibold text-brand-600">
                        {item.order.code}
                      </span>
                    )}
                    {isAdmin && item.user && <span>{item.user.fullName}</span>}
                    <span title={dateTime(item.createdAt)}>{relative(item.createdAt)}</span>
                  </div>

                  {item.error && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-rose-600">
                      <AlertCircle className="h-3 w-3" />
                      {item.error}
                    </p>
                  )}
                </div>

                {item.status === 'SENT' && (
                  <CheckCheck className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                )}
              </button>
            </li>
          ))}
        </ul>

        {notifications.data && (
          <Pagination
            page={notifications.data.pagination.page}
            totalPages={notifications.data.pagination.totalPages}
            total={notifications.data.pagination.total}
            onChange={setPage}
          />
        )}
      </Card>

      {/* rendered preview */}
      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.subject ?? 'Message'}
        subtitle={
          preview ? `${preview.channel} to ${preview.recipient} · ${dateTime(preview.createdAt)}` : ''
        }
        size="lg"
        footer={
          preview?.order && (
            <Link
              to={`${isAdmin ? '/admin' : '/app'}/orders/${preview.orderId}`}
              className="btn-secondary btn-sm"
            >
              Open order {preview.order.code}
            </Link>
          )
        }
      >
        {preview?.html ? (
          <div
            className="overflow-hidden rounded-xl border border-ink-200"
            // The HTML here is generated by our own templates, not user input.
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap rounded-xl bg-ink-50 p-4 font-mono text-sm text-ink-700">
            {preview?.body}
          </pre>
        )}
      </Modal>
    </>
  );
}
