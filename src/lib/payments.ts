import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PaymentTransaction, PlatformIncomeSummary, SubscriptionTier, BillingInterval, TIER_PLANS } from "@/types/subscription";
import { UserProfileDocument } from "@/lib/userProfile";

const LOCAL_STORAGE_PAYMENTS_KEY = "card_id_payments_cache_v1";

/**
 * Persists a new customer payment transaction to Firestore under /payments/{id}
 * and immediately updates the customer's subscription tier and scan allowance.
 */
export async function recordPaymentTransaction(paymentData: {
  userId: string;
  userEmail: string | null;
  tier: SubscriptionTier;
  amount: number;
  interval: BillingInterval;
  paymentMethod?: string;
  customerName?: string;
}): Promise<PaymentTransaction> {
  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const newPayment: PaymentTransaction = {
    id: paymentId,
    userId: paymentData.userId,
    userEmail: paymentData.userEmail,
    tier: paymentData.tier,
    amount: paymentData.amount,
    currency: "USD",
    interval: paymentData.interval,
    status: "succeeded",
    timestamp: nowIso,
    paymentMethod: paymentData.paymentMethod || "Credit Card (via Stripe/Simulation)",
    customerName: paymentData.customerName || paymentData.userEmail?.split("@")[0] || "Collector",
  };

  // 1. Cache locally for instant offline/fallback capability
  try {
    const existingStr = localStorage.getItem(LOCAL_STORAGE_PAYMENTS_KEY);
    const existingList: PaymentTransaction[] = existingStr ? JSON.parse(existingStr) : [];
    localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify([newPayment, ...existingList]));
  } catch (e) {
    console.warn("Could not cache payment to localStorage:", e);
  }

  // 2. Persist to Firestore /payments
  try {
    const paymentRef = doc(db, "payments", paymentId);
    await setDoc(paymentRef, newPayment);
  } catch (err) {
    console.warn("Firestore payments write note:", err);
  }

  // 3. Update customer's profile in /users/{userId}
  try {
    const userRef = doc(db, "users", paymentData.userId);
    const planConfig = TIER_PLANS[paymentData.tier];
    const scansToAdd = planConfig.scansLimit;

    await updateDoc(userRef, {
      subscriptionTier: paymentData.tier,
      subscriptionStatus: "active",
      billingCycle: paymentData.interval,
      planAmount: paymentData.amount,
      lastPaymentDate: nowIso,
      scansRemaining: scansToAdd,
      monthlyScanLimit: scansToAdd,
    });
  } catch (err) {
    console.warn("Firestore user profile update note after payment:", err);
  }

  return newPayment;
}

/**
 * Real-time listener for the /payments collection.
 */
export function subscribeToPayments(
  onUpdate: (payments: PaymentTransaction[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const q = query(collection(db, "payments"), orderBy("timestamp", "desc"));
    return onSnapshot(
      q,
      (snapshot) => {
        const payments: PaymentTransaction[] = [];
        snapshot.forEach((docSnap) => {
          payments.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });

        // Save fresh cache
        try {
          localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(payments));
        } catch (e) {}

        onUpdate(payments);
      },
      (err) => {
        console.warn("Firestore payments listener fallback to cache:", err);
        if (onError) onError(err);
        // Fallback to local cache
        try {
          const cached = localStorage.getItem(LOCAL_STORAGE_PAYMENTS_KEY);
          if (cached) onUpdate(JSON.parse(cached));
        } catch (e) {}
      }
    );
  } catch (err) {
    console.warn("Failed to subscribe to payments:", err);
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_PAYMENTS_KEY);
      if (cached) onUpdate(JSON.parse(cached));
    } catch (e) {}
    return () => {};
  }
}

/**
 * Real-time listener for the /users collection for Admin Monitoring.
 */
export function subscribeToAllUsers(
  onUpdate: (users: UserProfileDocument[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const q = query(collection(db, "users"));
    return onSnapshot(
      q,
      (snapshot) => {
        const users: UserProfileDocument[] = [];
        snapshot.forEach((docSnap) => {
          users.push(docSnap.data() as UserProfileDocument);
        });
        onUpdate(users);
      },
      (err) => {
        console.warn("Firestore all users listener notice:", err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.warn("Failed to subscribe to users:", err);
    return () => {};
  }
}

/**
 * Computes live business income metrics from payments and users.
 */
export function computeIncomeMetrics(
  payments: PaymentTransaction[],
  users: UserProfileDocument[]
): PlatformIncomeSummary {
  // 1. Total Gross Revenue (Sum of succeeded payments)
  const succeededPayments = payments.filter((p) => p.status === "succeeded");
  const totalGrossRevenue = succeededPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

  // 2. User & Subscription Counts
  const totalUsers = users.length;
  let starterSubscribers = 0;
  let proSubscribers = 0;
  let freeUsers = 0;

  users.forEach((u) => {
    const tier = u.subscriptionTier || "free";
    if (tier === "starter") starterSubscribers++;
    else if (tier === "pro") proSubscribers++;
    else freeUsers++;
  });

  const totalSubscribers = starterSubscribers + proSubscribers;

  // 3. Monthly Recurring Revenue (MRR)
  // Starter: $9.99/mo; Pro: $29.99/mo
  const monthlyRecurringRevenue =
    starterSubscribers * TIER_PLANS.starter.monthlyPrice +
    proSubscribers * TIER_PLANS.pro.monthlyPrice;

  // 4. Annual Run Rate (ARR)
  const annualRunRate = monthlyRecurringRevenue * 12;

  // 5. Conversion Rate (% of all registered users that are paid)
  const conversionRate = totalUsers > 0 ? parseFloat(((totalSubscribers / totalUsers) * 100).toFixed(1)) : 0;

  return {
    totalGrossRevenue: parseFloat(totalGrossRevenue.toFixed(2)),
    monthlyRecurringRevenue: parseFloat(monthlyRecurringRevenue.toFixed(2)),
    annualRunRate: parseFloat(annualRunRate.toFixed(2)),
    totalTransactions: succeededPayments.length,
    totalUsers,
    totalSubscribers,
    starterSubscribers,
    proSubscribers,
    freeUsers,
    conversionRate,
  };
}

/**
 * Seed initial sample transactions if database is fresh, allowing the admin to inspect revenue charts immediately.
 */
export const SAMPLE_INITIAL_PAYMENTS: PaymentTransaction[] = [
  {
    id: "pay_demo_01",
    userId: "usr_cardpro_99",
    userEmail: "dave.breakercards@gmail.com",
    tier: "pro",
    amount: 279.0,
    currency: "USD",
    interval: "yearly",
    status: "succeeded",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    paymentMethod: "Apple Pay (via Stripe)",
    customerName: "Dave Breaker",
  },
  {
    id: "pay_demo_02",
    userId: "usr_slabking_44",
    userEmail: "jordan.collector@hotmail.com",
    tier: "starter",
    amount: 9.99,
    currency: "USD",
    interval: "monthly",
    status: "succeeded",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 42).toISOString(),
    paymentMethod: "Visa ending in 4242",
    customerName: "Jordan C.",
  },
  {
    id: "pay_demo_03",
    userId: "usr_arbitrage_12",
    userEmail: "sarah.sportscards@yahoo.com",
    tier: "pro",
    amount: 29.99,
    currency: "USD",
    interval: "monthly",
    status: "succeeded",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 75).toISOString(),
    paymentMethod: "Mastercard ending in 8812",
    customerName: "Sarah M.",
  },
];
