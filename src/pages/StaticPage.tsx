import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { formatDateOnly } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CalendarDays, ShieldCheck } from "lucide-react";

function BlogIndex() {
  const posts = useQuery(api.content.listPublishedPosts, { limit: 30 }) as any[] | undefined;
  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Blog & Notícias</h1>
        <div className="mt-8 space-y-4">
          {posts === undefined && (
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          )}
          {posts?.length === 0 && (
            <p className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
              Nenhum post publicado ainda.
            </p>
          )}
          {posts?.map((post) => (
            <Link
              key={post._id}
              to={`/blog/${post.slug}`}
              className="block rounded-xl border bg-card p-6 transition hover:border-primary/40 hover:shadow-sm"
            >
              <h2 className="text-xl font-semibold hover:text-primary">{post.title}</h2>
              {post.excerpt && <p className="mt-1 text-sm text-muted-foreground">{post.excerpt}</p>}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" />
                {formatDateOnly(post.publishedAt ?? post.createdAt)}
                {post.author ? ` · ${post.author}` : ""}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </StoreLayout>
  );
}

function BlogPost({ slug }: { slug: string }) {
  const post = useQuery(api.content.getPostBySlug, { slug }) as any | null | undefined;
  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        {post === undefined && <div className="h-64 animate-pulse rounded-xl bg-muted" />}
        {post === null && (
          <div className="py-24 text-center">
            <p className="text-xl font-bold">Post não encontrado</p>
            <Button className="mt-6" asChild><Link to="/blog">Voltar ao blog</Link></Button>
          </div>
        )}
        {post && (
          <article>
            {post.cover && (
              <img src={post.cover} alt={post.title} className="aspect-video w-full rounded-xl object-cover" />
            )}
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{post.title}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              {formatDateOnly(post.publishedAt ?? post.createdAt)}
              {post.author ? ` · ${post.author}` : ""}
            </p>
            <div className="mt-6 whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {post.content}
            </div>
          </article>
        )}
      </div>
    </StoreLayout>
  );
}

/**
 * Renderizador leve para o conteúdo das páginas institucionais.
 * Suporta: ## / ### títulos, - listas, > destaques e --- separadores.
 */
function RichContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-4 space-y-2">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2.5 leading-relaxed">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-sky-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    if (line === "---") {
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-8 border-border" />);
    } else if (line.startsWith("> ")) {
      blocks.push(
        <div
          key={`q-${blocks.length}`}
          className="my-5 rounded-2xl border border-sky-500/25 bg-sky-500/5 px-5 py-4 text-[15px] font-semibold leading-relaxed"
        >
          {line.slice(2)}
        </div>,
      );
    } else if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="mt-7 text-lg font-extrabold tracking-tight">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="mt-9 text-xl font-extrabold uppercase tracking-tight first:mt-0">
          {line.slice(3)}
        </h2>,
      );
    } else {
      blocks.push(
        <p key={`p-${blocks.length}`} className="my-3 leading-relaxed">
          {line}
        </p>,
      );
    }
  }
  flushList();

  return <div className="text-[15px] text-muted-foreground sm:text-base">{blocks}</div>;
}

function InstitutionalPage({ slug }: { slug: string }) {
  const page = useQuery(api.content.getPageBySlug, { slug }) as any | null | undefined;
  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        {page === undefined && <div className="h-64 animate-pulse rounded-xl bg-muted" />}
        {page === null && (
          <div className="py-24 text-center">
            <p className="text-xl font-bold">Página não encontrada</p>
            <Button className="mt-6" asChild><Link to="/">Voltar à loja</Link></Button>
          </div>
        )}
        {page && (
          <>
            <div className="rounded-3xl border bg-card p-6 sm:p-10">
              <span className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
                <ShieldCheck className="size-3.5 text-sky-400" /> Apollo Craft
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{page.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Última atualização: {formatDateOnly(page.updatedAt ?? page.createdAt)}
              </p>
              <div className="mt-8">
                <RichContent content={page.content} />
              </div>
            </div>
          </>
        )}
      </div>
    </StoreLayout>
  );
}

export default function StaticPage() {
  const { "*": wildcard = "", slug } = useParams();
  const path = slug ?? wildcard;

  if (path === "blog" || path === "") {
    return <BlogIndex />;
  }
  if (path.startsWith("blog/")) {
    return <BlogPost slug={path.slice(5)} />;
  }
  return <InstitutionalPage slug={path} />;
}
