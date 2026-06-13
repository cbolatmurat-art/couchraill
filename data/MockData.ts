export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  password?: string;
  phone?: string;
  avatar?: string;
  userType: 'seeker' | 'host';
  city?: string; // host için
  acceptsGuests?: boolean;
  verified: boolean;
  joinedDate: string;
  profileImage?: string | null;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  identityVerificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
  instagramUsername?: string;
  tiktokUsername?: string;
  ratingAverage?: number;
  ratingCount?: number;
  hiddenConversations?: string[];
  termsAccepted?: boolean;
  termsAcceptedAt?: string;
  birthDate?: string;
}

export interface Review {
  id: string;
  reviewerId: string;
  reviewedUserId: string;
  requestId: string;
  rating: number; // 1-5
  comment: string;
  createdAt: string;
}

export interface AccommodationRequest {
  id: string;
  userId: string; // the guest
  hostId?: string;
  listingId?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  city: string;
  district?: string;
  startDate: string;
  endDate: string;
  guestsCount: number;
  description: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface Listing {
  id: string;
  hostId: string; // Legacy
  ownerId?: string;
  ownerType?: 'host';
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  title: string;
  city: string;
  district?: string;
  description: string;
  capacity: number;
  price?: string;
  availableFrom?: string;
  availableTo?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
  reactions?: { userId: string; emoji: string; createdAt: string }[];
  replyTo?: { messageId: string; text: string; senderId: string; senderName?: string };
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  participantProfiles: Record<string, string | null>;
  createdAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
  mutedBy?: string[];
  deletedBy?: string[];
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'request_created' | 'request_accepted' | 'request_rejected' | 'message_received' | 'message_reaction' | 'message_reply' | 'listing_removed' | 'profile_verified' | 'identity_approved' | 'identity_rejected' | 'email_verified' | 'phone_verified' | 'new_follower' | 'poke' | 'friend_request' | 'friend_request_accepted' | 'system';
  title: string;
  message: string;
  relatedId?: string;
  relatedType?: string;
  relatedUserId?: string;
  read: boolean;
  createdAt: string;
}

export const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'Ahmet Yılmaz',
    email: 'ahmet@example.com',
    password: 'password123',
    phone: '05551112233',
    userType: 'seeker',
    verified: true,
    joinedDate: '2023-01-15',
    ratingAverage: 4.9,
    ratingCount: 12,
  },
  {
    id: 'u2',
    name: 'Ayşe Kaya',
    email: 'ayse@example.com',
    password: 'password123',
    phone: '05552223344',
    userType: 'host',
    city: 'İstanbul',
    verified: true,
    joinedDate: '2022-11-20',
  }
];

export const MOCK_LISTINGS: Listing[] = [
  {
    id: 'l1',
    hostId: 'u2',
    title: 'Kadıköy Merkezde Misafir Odası',
    city: 'İstanbul',
    description: 'Evimde boş olan bir odayı misafirlere açıyorum. Metroya çok yakın.',
    capacity: 2,
    createdAt: '2024-05-20T10:00:00Z'
  }
];

export const MOCK_REQUESTS: AccommodationRequest[] = [
  {
    id: 'r1',
    userId: 'u1',
    city: 'İstanbul',
    startDate: '10/06/2026',
    endDate: '15/06/2026',
    guestsCount: 2,
    description: 'Üniversite sınavı için İstanbul\'a geliyoruz. İki kişiyiz, temiz ve sessiz bir ortam arıyoruz.',
    status: 'pending',
    createdAt: '2024-05-25T10:00:00Z'
  }
];

export const MOCK_MESSAGES: Message[] = [];
