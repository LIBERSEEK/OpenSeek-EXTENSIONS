import { CopyButton, CopyOption } from "@/components/copy/copy-button";
import { ToolMenu } from "@/components/common/tool-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { defineSocialMediaCopilotUi } from "@/utils/ui";
import { webV1UserOtherinfo } from "../api/user";

const Component = (props: {
  userId: string;
}) => {
  const { userId } = props;
  const [userInfo, setUserInfo] = useState<XhsAPI.WebV1UserOtherinfo>();

  const getUserInfo = async () => {
    if (userInfo) return userInfo;
    const res = await webV1UserOtherinfo(userId);
    setUserInfo(res);
    return res;
  };

  const handlerOpenExportDialog = async () => {
    const user = await getUserInfo();
    sendMessage('openTaskDialog', {
      name: 'author-post',
      author: {
        id: userId,
        name: user.basic_info.nickname,
        url: location.href
      }
    })
  }

  const copyOptions: CopyOption[] = [
    {
      label: "小红书号",
      value: "basic_info.red_id",
    },
    {
      label: "博主昵称",
      value: "basic_info.nickname",
    },
    {
      label: "个人简介",
      value: "basic_info.desc",
    }];

  return (<ToolMenu>
    <CopyButton submenu options={copyOptions} getData={getUserInfo}>复制博主信息</CopyButton>
    <DropdownMenuItem onSelect={handlerOpenExportDialog}>导出笔记数据</DropdownMenuItem>
  </ToolMenu>);
};

export default defineSocialMediaCopilotUi({
  name: 'social-media-copilot-xhs-user-profile',
  position: "inline",
  className: "inline-flex pt-2",
  matches: ["*://www.xiaohongshu.com/user/profile/*"],
  anchor: "#userPageContainer .user-info .info-part .info",
  render: ({ root, remove }) => {
    const userId = location.pathname.split('/').reverse()[0];
    if (userId) {
      root.render(<Component userId={userId} />);
    } else {
      remove();
    }
  },
});