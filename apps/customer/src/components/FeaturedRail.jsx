/**
 * "Chef's picks" — a sideways rail of the items the owner flagged as featured.
 *
 * Shown only on the unfiltered menu. Once someone has searched or picked a
 * category they have told us what they want, and a rail of something else is
 * just noise in the way of it.
 */
export default function FeaturedRail({ items, currencySymbol, onOpen }) {
  if (items.length === 0) return null;

  return (
    <section className="rail-section">
      <div className="section-head">
        <h2>Chef&apos;s picks</h2>
        <span className="section-rule" aria-hidden />
        <span className="section-count">{items.length}</span>
      </div>

      <div className="rail">
        {items.map((item) => {
          const price = item.variants.length > 0 ? item.variants[0].price : item.basePrice;
          return (
            <button key={item.id} type="button" className="rail-card" onClick={() => onOpen(item)}>
              <div className="rail-card-img">
                {item.imageUrl
                  ? <img src={item.imageUrl} alt="" loading="lazy" />
                  : <span className="rail-card-emoji">{item.categoryIcon}</span>}
                <span className="rail-card-price">
                  {item.variants.length > 0 && <em>from </em>}{currencySymbol}{price}
                </span>
              </div>
              <span className="rail-card-name">{item.name}</span>
              <span className="rail-card-cat">{item.categoryName}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
