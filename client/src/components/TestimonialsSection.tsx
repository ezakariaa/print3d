import { useEffect, useState } from 'react';
import { Container } from 'react-bootstrap';
import { fetchTestimonials, type PublicTestimonial } from '../api/client';
import { SAMPLE_TESTIMONIALS } from '../config/testimonials';

type Testimonial = Omit<PublicTestimonial, 'id'> & { id?: string };

const AVATAR_COLORS = ['#b7791f', '#2f855a', '#e11d48', '#0284c7', '#d97706', '#0d9488', '#c026d3', '#7c3aed'];

function initials(name: string) {
  // « Yassine Bennani » → « YB »; a single name gives its first two letters.
  const parts = name.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.slice(0, 2) || '?';
}

function ReviewCard({ review, index, hidden }: { review: Testimonial; index: number; hidden?: boolean }) {
  const rating = Math.max(1, Math.min(5, Math.round(review.rating)));
  return (
    <figure className="review-card" aria-hidden={hidden || undefined}>
      <div className="review-stars" role="img" aria-label={`${rating} étoiles sur 5`}>
        {Array.from({ length: 5 }, (_, star) => (
          <svg key={star} viewBox="0 0 24 24" className={star < rating ? 'is-on' : ''} aria-hidden="true">
            <path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z" />
          </svg>
        ))}
      </div>
      <blockquote className="review-text" dir="auto">{review.text}</blockquote>
      <figcaption className="review-author">
        <span className="review-avatar" style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }} aria-hidden="true">
          {initials(review.name)}
        </span>
        <span>
          <span className="review-name">{review.name}</span>
          <span className="review-place">{review.place}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** One row, scrolling endlessly: the list is drawn twice so the loop has no gap. */
function ReviewRow({ reviews, offset, reverse }: { reviews: Testimonial[]; offset: number; reverse?: boolean }) {
  return (
    <div className={`review-row${reverse ? ' is-reverse' : ''}`}>
      <div className="review-track" style={{ animationDuration: `${Math.max(30, reviews.length * 9)}s` }}>
        {[0, 1].map((copy) => (
          <div className="review-group" key={copy}>
            {reviews.map((review, index) => (
              <ReviewCard key={`${copy}-${review.name}-${index}`} review={review} index={index + offset} hidden={copy === 1} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Ils nous recommandent": customer reviews in two rows moving in opposite directions. */
export function TestimonialsSection() {
  const [published, setPublished] = useState<Testimonial[]>([]);
  useEffect(() => {
    fetchTestimonials().then(setPublished).catch(() => setPublished([]));
  }, []);
  // Hidden while no review is published; in development the samples preview the layout.
  const reviews = published.length > 0 || !import.meta.env.DEV ? published : SAMPLE_TESTIMONIALS;
  if (reviews.length === 0) return null;

  // Two rows when there are enough reviews; each row is padded so it is wider than the screen.
  const half = Math.ceil(reviews.length / 2);
  const rows = reviews.length >= 6 ? [reviews.slice(0, half), reviews.slice(half)] : [reviews];
  const fill = (list: Testimonial[]) => {
    const out = [...list];
    while (out.length < 5) out.push(...list);
    return out;
  };

  return (
    <section className="section reviews-section" aria-labelledby="reviews-title">
      <Container className="text-center">
        <span className="reviews-kicker"><span aria-hidden="true">●</span> Avis clients</span>
        <h2 id="reviews-title" className="section-title mb-2">Ils nous recommandent</h2>
        <p className="section-lead mx-auto mb-0">La confiance de nos clients est notre meilleure publicité.</p>
      </Container>
      <div className="review-rows">
        {rows.map((row, index) => (
          <ReviewRow key={index} reviews={fill(row)} offset={index * half} reverse={index === 1} />
        ))}
      </div>
    </section>
  );
}
