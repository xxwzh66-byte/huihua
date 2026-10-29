import sad from "../assets/brand/expressions/sad.webp";

export function MochiMascot() {
  return (
    <div className="mochi-mascot" aria-hidden="true">
      <span className="mochi-shadow" />
      <div className="mochi-body">
        <img className="mochi-open" src={sad} alt="" draggable={false} />
      </div>
    </div>
  );
}
