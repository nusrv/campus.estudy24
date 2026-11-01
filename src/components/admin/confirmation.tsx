'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
export function useConfirmation() {
  const dialog = useRef<HTMLDialogElement>(null), resolve = useRef<((yes: boolean) => void) | null>(null);
  const [message, setMessage] = useState('');
  function finish(yes: boolean) { dialog.current?.close(); resolve.current?.(yes); resolve.current = null; }
  return {
    confirm(message: string) { setMessage(message); dialog.current?.showModal(); return new Promise<boolean>(done => { resolve.current = done; }); },
    confirmation: <dialog ref={dialog} aria-label="تأكيد العملية" onCancel={() => finish(false)} className="m-auto w-[min(440px,94vw)] rounded-[18px] border border-border bg-white p-5 backdrop:bg-black/30"><h2 className="text-lg font-medium">تأكيد العملية</h2><p className="my-4 text-sm leading-7">{message}</p><div className="flex gap-3"><Button onClick={() => finish(true)}>تأكيد</Button><Button variant="outline" onClick={() => finish(false)}>إلغاء</Button></div></dialog>,
  };
}
