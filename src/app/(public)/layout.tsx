import { CampusFooter, CampusHeader } from "@/components/campus/public-shell";
export default function PublicLayout({ children }: { children: React.ReactNode }) { return <><a href="#public-content" className="skip-link">انتقل إلى المحتوى</a><CampusHeader /><main id="public-content" className="mx-auto min-h-[60dvh] max-w-7xl px-5 pt-9 sm:px-8 sm:pt-12">{children}</main><CampusFooter /></>; }
