-- ツリー共有フラグ
ALTER TABLE public.trees ADD COLUMN shared boolean NOT NULL DEFAULT false;

-- 共有ツリーは誰でも読める
CREATE POLICY "shared trees readable" ON public.trees
  FOR SELECT USING (shared = true);

-- 共有ツリーのノードも誰でも読める
CREATE POLICY "shared nodes readable" ON public.nodes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.trees t WHERE t.id = tree_id AND t.shared = true)
  );
