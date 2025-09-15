import baostock as bs
import pandas as pd
import os
import time

# 配置参数
stock = {
    "start_date": os.environ.get("TB_START_DATE", "2024-01-01"),
    "end_date": os.environ.get("TB_END_DATE", "2025-09-11"),
    "output_dir": "data",
    "stock_code": os.environ.get("TB_STOCK_CODE", "sh.601360"),
    "stock_name": os.environ.get("TB_STOCK_NAME", "360"),
    # d=日, w=周, m=月, 5/15/30/60=分钟
    "frequency": os.environ.get("TB_FREQUENCY", "5"),
}

# 调试输出：打印关键环境变量与解析后的参数
try:
    tb_env = {
        "TB_STOCK_CODE": os.environ.get("TB_STOCK_CODE"),
        "TB_STOCK_NAME": os.environ.get("TB_STOCK_NAME"),
        "TB_START_DATE": os.environ.get("TB_START_DATE"),
        "TB_END_DATE": os.environ.get("TB_END_DATE"),
        "TB_FREQUENCY": os.environ.get("TB_FREQUENCY"),
    }
    print("[DEBUG] cwd:", os.getcwd(), flush=True)
    print("[DEBUG] TB_* env:", tb_env, flush=True)
    print("[DEBUG] resolved params:", stock, flush=True)
except Exception as _e:
    print("[DEBUG] print env error:", str(_e), flush=True)

def login_with_retries(max_retries: int = 5):
    """带退避的登录重试，返回登录结果或None"""
    delay = 1
    for i in range(max_retries):
        lg = bs.login()
        try:
            print("login respond error_code:", lg.error_code)
            print("login respond  error_msg:", getattr(lg, 'error_msg', ''))
        except Exception:
            pass
        if lg.error_code == '0':
            return lg
        time.sleep(delay)
        delay = min(delay * 2, 8)
    return None

# 登录baostock（带重试）
lg = login_with_retries()
if not lg:
    print("登录失败，多次重试仍失败，建议稍后再试或使用现有CSV数据进行回测。")
    raise SystemExit(1)

try:
    # 查询历史K线数据
    # 不同频率的字段选择：分钟线含 time，日/周/月不含 time
    is_minute = str(stock["frequency"]) in ("5", "15", "30", "60")
    fields = (
        "date,time,open,high,low,close,volume,amount" if is_minute
        else "date,open,high,low,close,volume,amount"
    )
    rs = bs.query_history_k_data_plus(
        stock["stock_code"],
        fields,
        start_date=stock["start_date"],
        end_date=stock["end_date"],
        adjustflag="2",  # 前复权
        frequency=stock["frequency"],
    )
    print('query_history_k_data_plus respond error_code:', rs.error_code)
    print('query_history_k_data_plus respond  error_msg:', getattr(rs, 'error_msg', ''))
    stock_list = []
    while (rs.error_code == '0') & rs.next():
        stock_list.append(rs.get_row_data())
    if stock_list:
        df = pd.DataFrame(stock_list, columns=rs.fields)

        # 规范列：timestamps,open,high,low,close,volume,amount
        def build_timestamp(row):
            d = str(row.get('date') or '').strip()
            if is_minute:
                t = str(row.get('time') or '').strip()
                if t.isdigit() and len(t) >= 14:
                    return f"{d} {t[8:10]}:{t[10:12]}:{t[12:14]}"
                return f"{d} 00:00:00"
            # 日/周/月频率没有 time 字段
            return f"{d} 00:00:00"

        out = pd.DataFrame({
            'timestamps': df.apply(build_timestamp, axis=1),
            'open': pd.to_numeric(df['open'], errors='coerce'),
            'high': pd.to_numeric(df['high'], errors='coerce'),
            'low': pd.to_numeric(df['low'], errors='coerce'),
            'close': pd.to_numeric(df['close'], errors='coerce'),
            'volume': pd.to_numeric(df['volume'], errors='coerce'),
            'amount': pd.to_numeric(df['amount'], errors='coerce'),
        })

        # 清洗与排序
        out = out.dropna(subset=['timestamps', 'open', 'high', 'low', 'close', 'volume'])
        out = out.sort_values('timestamps').reset_index(drop=True)
        out['amount'] = out['amount'].fillna(0)

        # 数值格式化：OHLCV 最多2位小数（去尾零），amount 1位小数
        out['open'] = out['open'].round(2)
        out['high'] = out['high'].round(2)
        out['low'] = out['low'].round(2)
        out['close'] = out['close'].round(2)
        out['volume'] = out['volume'].round(2)
        out['amount'] = out['amount'].round(1)

        def fmt2(x):
            s = f"{x:.2f}"
            s = s.rstrip('0').rstrip('.')
            return s

        def fmt1(x):
            return f"{x:.1f}"

        for col in ['open', 'high', 'low', 'close', 'volume']:
            out[col] = out[col].apply(fmt2)
        out['amount'] = out['amount'].apply(fmt1)

        # 输出到 CSV（与 data/沃尔核材-002130.csv 格式一致）
        os.makedirs(stock["output_dir"], exist_ok=True)
        code = stock['stock_code'].split('.')[-1]
        safe_name = str(stock['stock_name'] or code).strip()
        if not safe_name:
          safe_name = code
        file_name = f"{safe_name}-{code}.csv"
        file_path = os.path.join(stock["output_dir"], file_name)
        out.to_csv(file_path, index=False, encoding='utf-8')
        print(f"已保存数据到: {file_path}")
    else:
        print("未获取到数据（可能是登录失败或无数据），请稍后重试或调整时间区间/频率")
except Exception as e:
    print("发生错误:", str(e))
finally:
    try:
        # 仅在成功登录后再尝试登出
        bs.logout()
    except Exception:
        pass
    print("已登出系统")
