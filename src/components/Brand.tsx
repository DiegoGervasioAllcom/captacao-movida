// Bloco de marca reutilizavel (logo + nome).
export default function Brand() {
  return (
    <div className="cm-brand">
      <div className="cm-logo" aria-hidden="true">
        ⚡
      </div>
      <div>
        <h1>Supper Certo</h1>
        <p>Indique e Ganhe</p>
      </div>
    </div>
  );
}
