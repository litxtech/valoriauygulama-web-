import { GroupMembersScreen } from '@/components/chat/GroupMembersScreen';

export default function StaffGroupMembersRoute() {
  return <GroupMembersScreen chatReturnPath="/staff/(tabs)/messages" />;
}
