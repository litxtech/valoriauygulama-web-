import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { theme } from '@/constants/theme';
import { PressableScale } from '@/components/premium/PressableScale';
import { KitchenDashboardStat } from '@/components/kitchenOps/KitchenUi';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

export type KitchenHubTile = {
  key: string;
  label: string;
  subtitle?: string;
  icon: IonIcon;
  route: string;
  color: string;
  bg: string;
};

const STOCK_TILES: KitchenHubTile[] = [
  { key: 'add', label: 'Stok Ekle', subtitle: 'Mal kabul / giriş', icon: 'add-circle', route: '/staff/kitchen-ops/stock/entry', color: '#059669', bg: '#ecfdf5' },
  { key: 'out', label: 'Stok Çıkış', subtitle: 'Kullanım ve fire', icon: 'remove-circle', route: '/staff/kitchen-ops/stock/exit', color: '#d97706', bg: '#fffbeb' },
  { key: 'current', label: 'Mevcut Stok', subtitle: 'Tüm ürünler', icon: 'layers', route: '/staff/kitchen-ops/stock/current', color: '#2563eb', bg: '#eff6ff' },
  { key: 'low', label: 'Azalan', subtitle: 'Kritik seviye', icon: 'alert-circle', route: '/staff/kitchen-ops/stock/low', color: '#dc2626', bg: '#fef2f2' },
];

const QUICK_ACTIONS: KitchenHubTile[] = [
  { key: 'menu_orders', label: 'Menü siparişleri', icon: 'bag-handle', route: '/staff/kitchen-ops/menu-orders', color: '#d97706', bg: '#fffbeb' },
  { key: 'scan', label: 'Barkod', icon: 'scan', route: '/staff/kitchen-ops/stock/scan', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'revenue', label: 'Hasılat', icon: 'cash', route: '/staff/kitchen-ops/revenue', color: '#059669', bg: '#ecfdf5' },
  { key: 'expense', label: 'Gider', icon: 'receipt', route: '/staff/kitchen-ops/expenses', color: '#ea580c', bg: '#fff7ed' },
  { key: 'shortages', label: 'Eksikler', icon: 'clipboard', route: '/staff/kitchen-ops/shortages', color: '#E67E22', bg: '#fff7ed' },
  { key: 'handover', label: 'Teslim', icon: 'swap-horizontal', route: '/staff/kitchen-ops/handovers', color: '#0d9488', bg: '#ecfdf5' },
  { key: 'pos', label: 'POS', icon: 'card', route: '/staff/kitchen-ops/pos', color: '#dc2626', bg: '#fef2f2' },
];

type FinanceRow = {
  key: string;
  label: string;
  subtitle: string;
  icon: IonIcon;
  route: string;
  color: string;
  bg: string;
};

const FINANCE_ROWS: FinanceRow[] = [
  { key: 'personnel', label: 'Personel ödemeleri', subtitle: 'Maaş ve avans kayıtları', icon: 'people', route: '/staff/kitchen-ops/personnel', color: '#2563eb', bg: '#eff6ff' },
  { key: 'suppliers', label: 'Tedarikçi borçları', subtitle: 'Alacak / borç takibi', icon: 'storefront', route: '/staff/kitchen-ops/suppliers', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'cari', label: 'Otel – Mutfak cari', subtitle: 'Karşılıklı bakiye', icon: 'git-compare', route: '/staff/kitchen-ops/cari', color: '#0d9488', bg: '#ecfdf5' },
  { key: 'settlements', label: 'Ödeme / mahsup', subtitle: 'Mutabakat işlemleri', icon: 'hand-left', route: '/staff/kitchen-ops/settlements', color: '#b45309', bg: '#fffbeb' },
  { key: 'finance', label: 'Finans özeti', subtitle: 'Günlük ve dönemsel rapor', icon: 'pie-chart', route: '/staff/kitchen-ops/finance', color: '#4f46e5', bg: '#eef2ff' },
  { key: 'reception', label: 'Resepsiyon muhasebe', subtitle: 'Resepsiyon ile mutabakat', icon: 'business', route: '/staff/kitchen-ops/reception', color: '#64748b', bg: '#f1f5f9' },
];

type Props = {
  onNavigate: (route: string) => void;
  alertCount?: number;
  netRemaining?: number;
  cariNet?: number;
  todayRevenue?: number;
  todayExpenses?: number;
  staffName?: string | null;
  showFinance?: boolean;
  showFinanceBridge?: boolean;
};

function SectionHeader({ title, icon }: { title: string; icon: IonIcon }) {
  return (
    <View style={styles.sectionHead}>
      <Ionicons name={icon} size={16} color={theme.colors.primary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function StockTile({
  item,
  onPress,
  badge,
}: {
  item: KitchenHubTile;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <PressableScale onPress={onPress} style={styles.stockTileWrap}>
      <View style={styles.stockTile}>
        <View style={[styles.stockIcon, { backgroundColor: item.bg }]}>
          <Ionicons name={item.icon} size={26} color={item.color} />
          {badge != null && badge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.stockLabel}>{item.label}</Text>
        {item.subtitle ? <Text style={styles.stockSub}>{item.subtitle}</Text> : null}
      </View>
    </PressableScale>
  );
}

function QuickPill({ item, onPress }: { item: KitchenHubTile; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.quickPill}>
      <View style={[styles.quickIcon, { backgroundColor: item.bg }]}>
        <Ionicons name={item.icon} size={20} color={item.color} />
      </View>
      <Text style={styles.quickLabel}>{item.label}</Text>
    </PressableScale>
  );
}

function FinanceListRow({ item, onPress }: { item: FinanceRow; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress}>
      <View style={styles.financeRow}>
        <View style={[styles.financeIcon, { backgroundColor: item.bg }]}>
          <Ionicons name={item.icon} size={20} color={item.color} />
        </View>
        <View style={styles.financeText}>
          <Text style={styles.financeLabel}>{item.label}</Text>
          <Text style={styles.financeSub}>{item.subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </View>
    </PressableScale>
  );
}

export function KitchenOpsHub({
  onNavigate,
  alertCount = 0,
  netRemaining = 0,
  cariNet = 0,
  todayRevenue = 0,
  todayExpenses = 0,
  staffName,
  showFinance = true,
  showFinanceBridge = true,
}: Props) {
  const todayLabel = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={['#92400e', '#b45309', '#d97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="restaurant" size={24} color="#fff" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Mutfak Operasyon</Text>
            <Text style={styles.heroSub}>{todayLabel}</Text>
          </View>
        </View>
        {staffName ? <Text style={styles.heroGreet}>Merhaba, {staffName.split(' ')[0]}</Text> : null}
      </LinearGradient>

      <View style={styles.statsRow}>
        {showFinance ? (
          <>
            <KitchenDashboardStat
              label="Bugün net"
              value={fmtKitchenMoney(netRemaining)}
              tone={netRemaining >= 0 ? 'positive' : 'danger'}
              icon="wallet-outline"
            />
            <KitchenDashboardStat label="Hasılat" value={fmtKitchenMoney(todayRevenue)} tone="info" icon="trending-up-outline" />
            <KitchenDashboardStat label="Gider" value={fmtKitchenMoney(todayExpenses)} tone="warning" icon="trending-down-outline" />
          </>
        ) : (
          <KitchenDashboardStat
            label="Stok uyarısı"
            value={alertCount > 0 ? `${alertCount} ürün` : 'Temiz'}
            tone={alertCount > 0 ? 'danger' : 'positive'}
            icon="alert-circle-outline"
            onPress={() => onNavigate('/staff/kitchen-ops/stock/low')}
          />
        )}
      </View>

      {showFinance ? (
        <View style={styles.statsRowSecondary}>
          <KitchenDashboardStat
            label="Cari net"
            value={fmtKitchenMoney(cariNet)}
            tone="neutral"
            icon="swap-horizontal-outline"
            onPress={() => onNavigate('/staff/kitchen-ops/cari')}
          />
          <KitchenDashboardStat
            label="Stok uyarısı"
            value={alertCount > 0 ? `${alertCount} ürün` : 'Temiz'}
            tone={alertCount > 0 ? 'danger' : 'positive'}
            icon="alert-circle-outline"
            onPress={() => onNavigate('/staff/kitchen-ops/stock/low')}
          />
        </View>
      ) : null}

      {showFinanceBridge ? (
        <PressableScale onPress={() => onNavigate('/staff/kitchen-ops/finance-bridge')}>
          <LinearGradient colors={['#312e81', '#4338ca', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.financeBridge}>
            <View style={styles.financeBridgeIcon}>
              <Ionicons name="git-compare-outline" size={22} color="#fff" />
            </View>
            <View style={styles.financeBridgeText}>
              <Text style={styles.financeBridgeTitle}>Mutfak ↔ Resepsiyon Finans</Text>
              <Text style={styles.financeBridgeSub}>Hasılat, gider, ödeme ve temiz kalan para</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color="#fff" />
          </LinearGradient>
        </PressableScale>
      ) : null}

      {alertCount > 0 ? (
        <PressableScale onPress={() => onNavigate('/staff/kitchen-ops/stock/low')}>
          <View style={styles.alertBanner}>
            <Ionicons name="warning" size={20} color="#b91c1c" />
            <Text style={styles.alertText}>
              {alertCount} ürün kritik veya az stok seviyesinde — hemen kontrol edin.
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#b91c1c" />
          </View>
        </PressableScale>
      ) : null}

      <SectionHeader title="Stok işlemleri" icon="cube-outline" />
      <View style={styles.stockGrid}>
        {STOCK_TILES.map((item) => (
          <StockTile
            key={item.key}
            item={item}
            onPress={() => onNavigate(item.route)}
            badge={item.key === 'low' ? alertCount : undefined}
          />
        ))}
      </View>

      <SectionHeader title="Hızlı işlemler" icon="flash-outline" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickScroll}>
        {QUICK_ACTIONS.filter((item) => showFinance || !['revenue', 'expense', 'pos'].includes(item.key)).map((item) => (
          <QuickPill key={item.key} item={item} onPress={() => onNavigate(item.route)} />
        ))}
      </ScrollView>

      {showFinance ? (
        <>
          <SectionHeader title="Finans & kayıtlar" icon="calculator-outline" />
          <View style={styles.financeList}>
            {FINANCE_ROWS.map((item) => (
              <FinanceListRow key={item.key} item={item} onPress={() => onNavigate(item.route)} />
            ))}
          </View>
        </>
      ) : null}

      <PressableScale onPress={() => onNavigate('/staff/kitchen-ops/day-close')}>
        <LinearGradient colors={['#4338ca', '#4f46e5', '#6366f1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dayClose}>
          <View style={styles.dayCloseIcon}>
            <Ionicons name="moon" size={22} color="#fff" />
          </View>
          <View style={styles.dayCloseText}>
            <Text style={styles.dayCloseTitle}>Gün Sonu Kapanış</Text>
            <Text style={styles.dayCloseSub}>Günü kapatın, özet ve teslimi tamamlayın</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={28} color="#fff" />
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  hero: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    ...theme.shadows.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 2, textTransform: 'capitalize' },
  heroGreet: { fontSize: 13, color: 'rgba(255,255,255,0.92)', marginTop: 10, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  statsRowSecondary: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 8,
  },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#b91c1c', lineHeight: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  stockGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stockTileWrap: { width: '48%', flexGrow: 1, minWidth: '46%' },
  stockTile: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    minHeight: 118,
    ...theme.shadows.sm,
  },
  stockIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stockLabel: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  stockSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3 },
  quickScroll: { gap: 10, paddingRight: 8, paddingBottom: 4 },
  quickPill: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 76,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  financeList: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  financeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  financeIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  financeText: { flex: 1, minWidth: 0 },
  financeLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  financeSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  dayClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    marginBottom: 8,
    ...theme.shadows.md,
  },
  dayCloseIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCloseText: { flex: 1 },
  dayCloseTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  dayCloseSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  financeBridge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.md,
  },
  financeBridgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  financeBridgeText: { flex: 1 },
  financeBridgeTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  financeBridgeSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
});
