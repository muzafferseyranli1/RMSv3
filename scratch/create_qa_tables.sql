CREATE TABLE IF NOT EXISTS public.qa_questions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  author_name TEXT NOT NULL,
  question_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT qa_questions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.qa_answers (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  question_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT qa_answers_pkey PRIMARY KEY (id),
  CONSTRAINT fk_qa_questions FOREIGN KEY (question_id) REFERENCES public.qa_questions (id) ON DELETE CASCADE
);
