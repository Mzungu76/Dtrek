-- `upsert: true` su Supabase Storage deve poter LEGGERE l'oggetto esistente prima di sostituirlo.
-- Senza una policy SELECT la riga è invisibile all'utente, quindi lo Storage tratta la richiesta
-- come un inserimento su una chiave che esiste già e la RLS la respinge con il messaggio generico
-- "new row violates row-level security policy" — che sembra un problema di autenticazione e non lo è.
--
-- Il bucket gemello `dtrek-photos` ha già questa policy (`users_read_own_photos`): è esattamente il
-- motivo per cui le foto si caricavano e i PDF di diario e resoconti no. La differenza fra i due
-- bucket è stata la prova che ha chiuso la diagnosi, dopo che una prima ipotesi (token scaduto) si
-- era rivelata sbagliata.
--
-- Il bucket è `public: true`, quindi chiunque abbia l'URL legge già i file: questa policy concede al
-- proprietario meno di quanto è pubblicamente esposto.
create policy users_read_own_reports
  on storage.objects
  for select
  using (
    bucket_id = 'dtrek-reports'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
