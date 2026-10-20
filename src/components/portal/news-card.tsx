"use client";

import { useState } from "react";
import { ArrowUpLeft, Bookmark, CalendarDays, Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type NewsArticle = { id: string; title: string; excerpt: string; university: string; category: string; image: string; imageAlt: string; date: string; readTime: string };

export function NewsCard({ article, onOpen }: { article: NewsArticle; onOpen: (article: NewsArticle) => void }) {
  const [saved, setSaved] = useState(false);
  return <Card className="group overflow-hidden"><div className="relative h-48 overflow-hidden bg-muted"><img src={article.image} alt={article.imageAlt} className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" /><span className="absolute start-4 top-4"><Badge className="border border-white/60 bg-white/95 text-foreground">{article.category}</Badge></span><Button variant="outline" size="icon" aria-label={saved ? "إلغاء حفظ الخبر" : "حفظ الخبر"} aria-pressed={saved} onClick={() => setSaved(!saved)} className="absolute end-4 top-4 size-8 rounded-lg border-white/70 bg-white/95"><Bookmark className={saved ? "fill-primary text-primary" : "text-secondary-foreground"} /></Button></div><div className="space-y-3 p-6"><span className="text-xs text-primary">{article.university}</span><h3 className="text-lg font-medium leading-[1.75]"><button onClick={() => onOpen(article)} className="text-start transition-colors hover:text-primary">{article.title}</button></h3><p className="text-sm leading-[1.9] text-secondary-foreground">{article.excerpt}</p><div className="flex flex-wrap items-center gap-4 border-t border-border pt-4 text-[11px] text-secondary-foreground"><span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{article.date}</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{article.readTime}</span><button onClick={() => onOpen(article)} aria-label={`قراءة ${article.title}`} className="ms-auto rounded p-1 text-primary hover:bg-accent"><ArrowUpLeft className="size-4" /></button></div></div></Card>;
}
