import sys
from rapidfuzz import fuzz
import re

from database import SessionLocal
from models import Complaint, Institution, Bureau, OverlapLink

GENERIC_WORDS = {
    'college', 'institute', 'technology', 'engineering', 'management',
    'pharmacy', 'architecture', 'school', 'academy', 'studies', 'university'
}
ABBREVS = {
    'engg': 'engineering', 'inst': 'institute', 'tech': 'technology',
    'coll': 'college', 'univ': 'university', 'mgmt': 'management'
}
FILLER_WORDS = {'the', 'of', 'and'}

def normalize_name(text: str) -> str:
    if not text:
        return ''
    s = text.lower()
    s = re.sub(r'[^\w\s]', ' ', s)
    tokens = [ABBREVS.get(t, t) for t in s.split() if t not in FILLER_WORDS]
    return ' '.join(tokens)

def extract_institution_alias(description: str) -> str | None:
    if not description:
        return None
    if ':' in description:
        prefix = description.split(':', 1)[0].strip()
        candidate = prefix.split(',', 1)[0].strip() if ',' in prefix else prefix
        lowered = candidate.lower()
        if any(kw in lowered for kw in ['college', 'engg', 'engineering', 'inst', 'institute', 'tech', 'technology', 'mgmt', 'management', 'pharmacy', 'architecture', 'school', 'univ', 'university']):
            return candidate
    return None

if __name__ == '__main__':
    db = SessionLocal()
    active_complaints = db.query(Complaint).filter(Complaint.status != 'Disposed').all()
    print(f'Active complaints: {len(active_complaints)}')

    overlaps = []
    for i in range(len(active_complaints)):
        for j in range(i + 1, len(active_complaints)):
            ca = active_complaints[i]
            cb = active_complaints[j]
            if ca.id > cb.id:
                ca, cb = cb, ca
            if ca.current_bureau_id == cb.current_bureau_id:
                continue

            bureau_a = ca.current_bureau.code
            bureau_b = cb.current_bureau.code

            alias_a = extract_institution_alias(ca.description)
            alias_b = extract_institution_alias(cb.description)

            has_spelling_variation = False
            var_X, var_Y = None, None

            if alias_a and normalize_name(alias_a) == normalize_name(ca.institution.name) and alias_a.lower() != ca.institution.name.lower():
                has_spelling_variation = True
                var_X, var_Y = alias_a, cb.institution.name
            elif alias_b and normalize_name(alias_b) == normalize_name(cb.institution.name) and alias_b.lower() != cb.institution.name.lower():
                has_spelling_variation = True
                var_X, var_Y = alias_b, ca.institution.name

            if has_spelling_variation and ca.institution_id == cb.institution_id:
                score = int(round(max(fuzz.token_set_ratio(normalize_name(var_X), normalize_name(var_Y)), fuzz.partial_ratio(normalize_name(var_X), normalize_name(var_Y)))))
                boost = 5 if ca.category == cb.category else 0
                overlaps.append({
                    'pair': (ca.case_id, cb.case_id),
                    'inst_a': ca.institution.name,
                    'inst_b': cb.institution.name,
                    'reason': f"Fuzzy name match: '{var_X}' ~ '{var_Y}' (score {score})",
                    'confidence': min(100, score + boost),
                    'layer': 2
                })
            elif ca.institution_id == cb.institution_id:
                overlaps.append({
                    'pair': (ca.case_id, cb.case_id),
                    'inst_a': ca.institution.name,
                    'inst_b': cb.institution.name,
                    'reason': f"Same AICTE Permanent ID handled by {bureau_a} and {bureau_b}",
                    'confidence': 100,
                    'layer': 1
                })
            else:
                na = normalize_name(ca.institution.name)
                nb = normalize_name(cb.institution.name)
                sim = max(fuzz.token_set_ratio(na, nb), fuzz.partial_ratio(na, nb))
                distinctive_a = set(na.split()) - GENERIC_WORDS
                distinctive_b = set(nb.split()) - GENERIC_WORDS
                if sim >= 88 and (distinctive_a & distinctive_b or ca.institution.city == cb.institution.city):
                    score = int(round(sim))
                    boost = 5 if ca.category == cb.category else 0
                    overlaps.append({
                        'pair': (ca.case_id, cb.case_id),
                        'inst_a': ca.institution.name,
                        'inst_b': cb.institution.name,
                        'reason': f"Fuzzy name match: '{ca.institution.name}' ~ '{cb.institution.name}' (score {score})",
                        'confidence': min(100, score + boost),
                        'layer': 2
                    })

    print(f'Total overlaps found: {len(overlaps)}')
    institutions_found = set()
    for o in overlaps:
        print(f"Layer {o['layer']}: {o['pair']} | {o['inst_a']} | Conf: {o['confidence']} | {o['reason']}")
        institutions_found.add(o['inst_a'])
    print('\nInstitutions detected in overlap scan:')
    for inst in sorted(institutions_found):
        print(f'  - {inst}')
    db.close()
