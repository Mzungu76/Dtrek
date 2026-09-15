// Ex pagina "il Diario come libro", ora unita alla copertina (app/leggi/d/[token]/page.tsx →
// DiaryPublicView.tsx): un Diario da solo non ha più un frontespizio separato dal contenuto dietro
// un pulsante "Vedi Reportage", è un unico scroll verticale dalla copertina alle escursioni.
// Questa rotta resta solo per non rompere link `/libro` già condivisi in passato — rimanda alla
// pagina unica, che mostra esattamente lo stesso contenuto (e anche di più: la copertina).
import { redirect } from 'next/navigation'

export default function DiarioLibroPage({ params }: { params: { token: string } }) {
  redirect(`/leggi/d/${params.token}`)
}
