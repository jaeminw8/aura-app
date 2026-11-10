import Avatar from './Avatar.jsx';
import { RELATIONSHIP_LABELS } from '../format.js';

export default function MemberProfile({ profile }) {
  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase();
  const details = [
    profile.age && `${profile.age} years old`,
    profile.gender,
    RELATIONSHIP_LABELS[profile.relationshipStatus],
  ].filter(Boolean);
  return (
    <div className="member-profile">
      <div className="member-profile__head">
        <Avatar initials={initials} color={profile.avatarColor} size={72} />
        <div>
          <h3>{profile.firstName} {profile.lastName}</h3>
          <p className="subtle">{profile.city}</p>
        </div>
      </div>
      {profile.photos?.length > 0 && (
        <div className="photos member-profile__photos" aria-label={`${profile.firstName}'s photos`}>
          {profile.photos.map((photo) => (
            <div key={photo.id} className="photo" style={{ background: '#E6E1FF', color: '#4C1D95' }}>
              [{photo.label}]
            </div>
          ))}
        </div>
      )}
      {profile.bio && <p className="profile-bio">{profile.bio}</p>}
      {details.length > 0 && <p className="gcard__meta">{details.join(' · ')}</p>}
      {profile.interests?.length > 0 && (
        <div className="chips" aria-label="Interests">
          {profile.interests.map((interest) => <span key={interest} className="chip">{interest}</span>)}
        </div>
      )}
      {profile.personalityTraits?.length > 0 && (
        <>
          <h4 className="section-label">Personality</h4>
          <div className="chips">
            {profile.personalityTraits.map((trait) => <span key={trait} className="chip chip--gray">{trait}</span>)}
          </div>
        </>
      )}
    </div>
  );
}
