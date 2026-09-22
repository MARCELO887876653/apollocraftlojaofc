import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import { api } from "@/convex/_generated/api";
import { StoreLayout } from "@/components/store/StoreLayout";
import { formatDateOnly } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

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

function InstitutionalPage({ slug }: { slug: string }) {
  const page = useQuery(api.content.getPageBySlug, { slug }) as any | null | undefined;
  return (
    <StoreLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        {page === undefined && <div className="h-64 animate-pulse rounded-xl bg-muted" />}
        {page === null && (
          <div className="py-24 text-center">
            <p className="text-xl font-bold">Página não encontrada</p>
            <Button className="mt-6" asChild><Link to="/">Voltar à loja</Link></Button>
          </div>
        )}
        {page && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">{page.title}</h1>
            <div className="mt-6 whitespace-pre-wrap leading-relaxed text-muted-foreground">
              {page.content}
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
