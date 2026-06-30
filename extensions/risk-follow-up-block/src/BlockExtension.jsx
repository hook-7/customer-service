import "@shopify/ui-extensions/preact";
import {render} from "preact";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  return (
    <s-admin-block heading="风控跟单提示" collapsedSummary="高风险复核">
      <s-stack direction="block" gap="base">
        <s-banner heading="高风险订单需要人工复核" tone="critical">
          请在发货前确认收货地址、IP 地点、账单国家和付款信息。确认无异常后再继续履约。
        </s-banner>
        <s-stack direction="inline" gap="base">
          <s-badge tone="critical" icon="alert-triangle">
            HIGH_REVIEW
          </s-badge>
          <s-badge tone="warning">Score 92</s-badge>
          <s-badge tone="info">DEMO</s-badge>
        </s-stack>
        <s-text tone="critical" type="strong">
          跟单动作：联系客户确认信息，记录处理结果后再发货。
        </s-text>
      </s-stack>
    </s-admin-block>
  );
}
