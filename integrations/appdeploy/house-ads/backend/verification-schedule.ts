type ScheduledInvocation = { type:string; name:string; scheduledTime:string };

// Keep provider-capable verification at its original seven daily slots.
// Additional invocations of the same single writer only advance DB/GitHub persistence.
export function isOriginalVerificationSlot(event:ScheduledInvocation | undefined) {
  if (!event || event.type !== 'cron' || event.name !== 'verify-publish') return false;
  const time = Date.parse(event.scheduledTime);
  if (!Number.isFinite(time)) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'America/Santiago', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).formatToParts(new Date(time));
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  return minute === 35 && [1,5,7,9,13,17,21].includes(hour);
}

